import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from redis.asyncio import Redis, from_url
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.service import TokenClaims
from ..config import global_config
from ..logger import get_logger
from .utils import (
    build_github_authorization_url,
    build_pkce_challenge,
    decrypt_github_token,
    encrypt_github_token,
    generate_oauth_state,
    generate_pkce_verifier,
    get_user_by_id,
)

logger = get_logger("github.service")


@dataclass(slots=True)
class GitHubProfile:
    login: str
    name: str | None
    avatar_url: str | None
    profile_url: str | None


class GitHubService:
    _redis: Redis | None = None

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_authorization_url(self, claims: TokenClaims) -> str:
        self._validate_config()
        redis = self._require_redis()
        state = generate_oauth_state()
        code_verifier = generate_pkce_verifier()
        state_payload = json.dumps(
            {
                "user_id": claims.user_id,
                "code_verifier": code_verifier,
            }
        )

        try:
            await redis.setex(
                self._state_key(state),
                global_config.GITHUB_OAUTH_STATE_TTL_SECONDS,
                state_payload,
            )
        except Exception as exc:
            logger.exception(
                "Не удалось сохранить состояние GitHub OAuth в Redis для пользователя %s",
                claims.user_id,
            )
            raise RuntimeError("Не удалось начать авторизацию GitHub.") from exc

        return build_github_authorization_url(
            state=state,
            code_challenge=build_pkce_challenge(code_verifier),
        )

    async def handle_callback(self, code: str, state: str) -> str:
        self._validate_config()
        redis = self._require_redis()
        try:
            raw_state = await redis.getdel(self._state_key(state))
        except Exception as exc:
            logger.exception("Не удалось получить состояние GitHub OAuth из Redis")
            raise RuntimeError("Не удалось завершить авторизацию GitHub.") from exc
        if not raw_state:
            raise ValueError("Состояние OAuth устарело или недействительно")

        payload = json.loads(raw_state)
        user_id = int(payload["user_id"])
        code_verifier = payload["code_verifier"]

        access_token = await self._exchange_code_for_token(code, code_verifier)
        profile = await self._fetch_github_profile(access_token)

        user = await get_user_by_id(self.db, user_id)
        if user is None:
            raise ValueError("Пользователь не найден")

        user.github_token = encrypt_github_token(access_token)
        await self.db.commit()

        return self._build_frontend_redirect_url(status="connected", login=profile.login)

    async def get_connection_profile(self, user_id: int) -> GitHubProfile | None:
        user = await get_user_by_id(self.db, user_id)
        if user is None or not user.github_token:
            return None

        try:
            access_token = decrypt_github_token(user.github_token)
            return await self._fetch_github_profile(access_token)
        except (ValueError, httpx.HTTPError) as exc:
            logger.warning("Не удалось получить GitHub-профиль пользователя %s: %s", user_id, exc)
            user.github_token = None
            await self.db.commit()
            return None

    async def disconnect(self, user_id: int) -> None:
        user = await get_user_by_id(self.db, user_id)
        if user is None or not user.github_token:
            return

        encrypted_token = user.github_token
        try:
            access_token = decrypt_github_token(encrypted_token)
        except ValueError as exc:
            logger.warning("Не удалось расшифровать GitHub token при отвязке для пользователя %s", user_id)
            user.github_token = None
            await self.db.commit()
            return

        if not self._has_oauth_revoke_config():
            logger.error("Не заданы настройки GitHub revoke для отвязки профиля пользователя %s", user_id)
            raise RuntimeError("Не удалось отвязать профиль GitHub.")

        try:
            await self._revoke_github_authorization(access_token)
        except httpx.HTTPError:
            logger.exception("Не удалось отозвать GitHub authorization для пользователя %s", user_id)
            raise RuntimeError("Не удалось отвязать профиль GitHub.")

        user.github_token = None
        await self.db.commit()

    async def _exchange_code_for_token(self, code: str, code_verifier: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={
                    "Accept": "application/json",
                },
                data={
                    "client_id": global_config.GITHUB_CLIENT_ID,
                    "client_secret": global_config.GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": global_config.GITHUB_REDIRECT_URI,
                    "code_verifier": code_verifier,
                },
            )

        if response.status_code >= 400:
            logger.warning(
                "GitHub отклонил обмен OAuth-кода: status=%s body=%s",
                response.status_code,
                response.text,
            )
            raise ValueError("GitHub отклонил авторизацию. Попробуйте ещё раз.")

        payload = response.json()
        access_token = payload.get("access_token")
        if not access_token:
            logger.warning("GitHub не вернул access token: %s", payload)
            raise ValueError("GitHub не завершил авторизацию. Попробуйте ещё раз.")
        return access_token

    async def _fetch_github_profile(self, access_token: str) -> GitHubProfile:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {access_token}",
                    "X-GitHub-Api-Version": global_config.GITHUB_API_VERSION,
                },
            )

        if response.status_code >= 400:
            logger.warning(
                "Ошибка при загрузке GitHub-профиля: status=%s body=%s",
                response.status_code,
                response.text,
            )
            raise httpx.HTTPStatusError(
                "GitHub profile request failed",
                request=response.request,
                response=response,
            )

        payload = response.json()
        return GitHubProfile(
            login=payload["login"],
            name=payload.get("name"),
            avatar_url=payload.get("avatar_url"),
            profile_url=payload.get("html_url"),
        )

    async def _revoke_github_authorization(self, access_token: str) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request(
                method="DELETE",
                url=f"https://api.github.com/applications/{global_config.GITHUB_CLIENT_ID}/grant",
                headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": global_config.GITHUB_API_VERSION,
                },
                auth=(global_config.GITHUB_CLIENT_ID, global_config.GITHUB_CLIENT_SECRET),
                json={"access_token": access_token}
            )

        if response.status_code != 204:
            logger.warning(
                "Ошибка при отзыве GitHub authorization: status=%s body=%s",
                response.status_code,
                response.text,
            )
            raise httpx.HTTPStatusError(
                "GitHub authorization revoke request failed",
                request=response.request,
                response=response,
            )

    @classmethod
    def _get_redis(cls) -> Redis | None:
        if not global_config.REDIS_URL:
            return None
        if cls._redis is None:
            cls._redis = from_url(
                global_config.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return cls._redis

    @classmethod
    def _require_redis(cls) -> Redis:
        redis = cls._get_redis()
        if redis is None:
            raise RuntimeError("Redis не настроен для GitHub OAuth")
        return redis

    @staticmethod
    def _state_key(state: str) -> str:
        return f"github:oauth:state:{state}"

    @staticmethod
    def _build_frontend_redirect_url(
        status: str,
        login: str | None = None,
        message: str | None = None,
    ) -> str:
        query: dict[str, str] = {"github": status}
        if login:
            query["login"] = login
        if message:
            query["message"] = message
        return f"{global_config.GITHUB_FRONTEND_REDIRECT_URL}?{urlencode(query)}"

    @staticmethod
    def _validate_config() -> None:
        required_values: dict[str, Any] = {
            "GITHUB_CLIENT_ID": global_config.GITHUB_CLIENT_ID,
            "GITHUB_CLIENT_SECRET": global_config.GITHUB_CLIENT_SECRET,
            "GITHUB_REDIRECT_URI": global_config.GITHUB_REDIRECT_URI,
            "GITHUB_FRONTEND_REDIRECT_URL": global_config.GITHUB_FRONTEND_REDIRECT_URL,
        }
        missing = [name for name, value in required_values.items() if not value]
        if missing:
            raise RuntimeError(
                f"Не заданы настройки GitHub OAuth: {', '.join(missing)}"
            )

    @staticmethod
    def _has_oauth_revoke_config() -> bool:
        return bool(
            global_config.GITHUB_CLIENT_ID
            and global_config.GITHUB_CLIENT_SECRET
        )
