import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.service import TokenClaims
from ..config import global_config
from ..utils.crypto import Cipher, Hasher, generate_urlsafe_token
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .utils import (
    build_github_authorization_url,
    get_user_by_id,
)
from ..analysis.analysers import analyzer
from ..models import User, GitHubProfile, GitHubRepo, UserRepo
from sqlalchemy import select
from sqlalchemy.orm import joinedload

logger = get_logger("github.service")
string_cipher = Cipher(
    secret_key=global_config.string_encryption_key(),
    algorithm=global_config.STRING_ENCRYPTION_ALGORITHM,
)


@dataclass(slots=True)
class GitHubProfileData:
    id: int
    login: str
    name: str | None
    avatar_url: str | None
    profile_url: str | None


class GitHubService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_authorization_url(self, claims: TokenClaims) -> str:
        self._validate_config()
        redis = get_redis()
        state = generate_urlsafe_token(32)
        code_verifier = generate_urlsafe_token(64)
        state_payload = json.dumps(
            {
                "type": "connect",
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
            code_challenge=Hasher.sha256_base64url(code_verifier),
        )

    async def create_login_url(self) -> str:
        self._validate_config()
        redis = get_redis()
        state = generate_urlsafe_token(32)
        code_verifier = generate_urlsafe_token(64)
        state_payload = json.dumps(
            {
                "type": "login",
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
            logger.exception("Не удалось сохранить состояние GitHub OAuth в Redis для логина")
            raise RuntimeError("Не удалось начать авторизацию GitHub.") from exc

        return build_github_authorization_url(
            state=state,
            code_challenge=Hasher.sha256_base64url(code_verifier),
        )

    async def handle_callback(self, code: str, state: str) -> str:
        self._validate_config()
        redis = get_redis()
        try:
            raw_state = await redis.getdel(self._state_key(state))
        except Exception as exc:
            logger.exception("Не удалось получить состояние GitHub OAuth из Redis")
            raise RuntimeError("Не удалось завершить авторизацию GitHub.") from exc
        if not raw_state:
            raise ValueError("Состояние OAuth устарело или недействительно")

        payload = json.loads(raw_state)
        action_type = payload.get("type", "connect")
        code_verifier = payload["code_verifier"]

        access_token = await self._exchange_code_for_token(code, code_verifier)
        profile = await self._fetch_github_profile(access_token)

        if action_type == "connect":
            user_id = int(payload["user_id"])
            user = await get_user_by_id(self.db, user_id)
            if user is None:
                raise ValueError("Пользователь не найден")

            # Проверка, не привязан ли этот профиль GitHub к другому аккаунту
            duplicate_result = await self.db.execute(
                select(GitHubProfile).where(GitHubProfile.id == profile.id, GitHubProfile.user_id != user_id)
            )
            if duplicate_result.scalar_one_or_none():
                return ("connect_error", "Этот профиль GitHub уже привязан к другому аккаунту")

            await self._upsert_github_profile(
                user_id=user_id,
                github_id=profile.id,
                encrypted_token=string_cipher.encrypt(access_token),
            )
            await self.db.commit()
            return ("connect", self._build_frontend_redirect_url(status="connected", login=profile.login))
        
        elif action_type == "login":
            result = await self.db.execute(
                select(User)
                .options(joinedload(User.role))
                .join(GitHubProfile, GitHubProfile.user_id == User.id)
                .where(GitHubProfile.id == profile.id)
            )
            user = result.unique().scalar_one_or_none()
            
            email = None
            if not user:
                # Если не нашли по ID, ищем по email
                email = await self._fetch_github_email(access_token)
                result = await self.db.execute(
                    select(User).options(joinedload(User.role)).where(User.email == email)
                )
                user = result.unique().scalar_one_or_none()
            
            encrypted_token = string_cipher.encrypt(access_token)
            
            if user:
                await self._upsert_github_profile(
                    user_id=user.id,
                    github_id=profile.id,
                    encrypted_token=encrypted_token,
                )
                await self.db.commit()
                return ("login", user)
            else:
                # Если пользователя нет, переходим к регистрации
                if not email:
                    email = await self._fetch_github_email(access_token)
                return ("register", {
                    "gh_id": profile.id,
                    "email": email,
                    "login": profile.login,
                    "gh_token_enc": encrypted_token,
                })
        
        raise ValueError("Неизвестный тип действия OAuth")

    async def get_connection_profile(self, user_id: int) -> GitHubProfileData | None:
        user = await get_user_by_id(self.db, user_id)
        github_profile = await self._get_profile_by_user_id(user_id)
        if user is None or not github_profile:
            return None

        try:
            access_token = string_cipher.decrypt(github_profile.github_token)
            return await self._fetch_github_profile(access_token)
        except (ValueError, httpx.HTTPError) as exc:
            logger.warning("Не удалось получить GitHub-профиль пользователя %s: %s", user_id, exc)
            await self.db.delete(github_profile)
            await self.db.commit()
            return None

    async def get_user_repositories(self, user_id: int, page: int = 1, limit: int = 10) -> dict:
        import math
        import asyncio
        from datetime import datetime

        user = await get_user_by_id(self.db, user_id)
        github_profile = await self._get_profile_by_user_id(user_id)
        if user is None or not github_profile:
            return {"items": [], "total_pages": 0, "current_page": page, "total_items": 0}

        try:
            access_token = string_cipher.decrypt(github_profile.github_token)
            
            redis = get_redis()
            cache_key = f"github:repos:v2:{user_id}"
            
            cached_data = None
            if redis:
                cached_data = await redis.get(cache_key)
                
            if cached_data:
                cache_obj = json.loads(cached_data)
                viewer_login = cache_obj.get("viewer_login")
                all_repos = cache_obj.get("repos", [])
            else:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    query = """
                    query {
                      viewer {
                        login
                        repositories(first: 100, ownerAffiliations: [OWNER], privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
                          nodes {
                            name
                            databaseId
                            url
                            description
                            defaultBranchRef {
                              target {
                                ... on Commit {
                                  authoredDate
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                    """
                    response = await client.post(
                        "https://api.github.com/graphql",
                        headers={"Authorization": f"Bearer {access_token}"},
                        json={"query": query}
                    )
                    
                    if response.status_code >= 400:
                        logger.warning("Error fetching repos via GraphQL: %s", response.status_code)
                        return {"items": [], "total_pages": 0, "current_page": page, "total_items": 0}
                        
                    data = response.json()
                    viewer_node = data.get("data", {}).get("viewer", {})
                    viewer_login = viewer_node.get("login")
                    nodes = viewer_node.get("repositories", {}).get("nodes", [])
                    
                    all_repos = []
                    for node in nodes:
                        last_commit = None
                        if node.get("defaultBranchRef") and node["defaultBranchRef"].get("target"):
                            last_commit = node["defaultBranchRef"]["target"].get("authoredDate")
                            
                        all_repos.append({
                            "gh_id": node.get("databaseId"),
                            "name": node["name"],
                            "url": node["url"],
                            "description": node.get("description"),
                            "last_commit_date": last_commit
                        })
                        
                if redis:
                    await redis.setex(cache_key, 300, json.dumps({"viewer_login": viewer_login, "repos": all_repos}))
                    
            total_items = len(all_repos)
            total_pages = max(1, math.ceil(total_items / limit))
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            page_repos = all_repos[start_idx:end_idx]

            repo_ids = [r["gh_id"] for r in page_repos if r.get("gh_id") is not None]
            github_repo_map = {}
            user_repo_map = {}

            if repo_ids:
                github_repos_result = await self.db.execute(
                    select(GitHubRepo).where(GitHubRepo.gh_id.in_(repo_ids))
                )
                github_repo_map = {
                    github_repo.gh_id: github_repo
                    for github_repo in github_repos_result.scalars()
                }

                db_repos_query = (
                    select(UserRepo, GitHubRepo)
                    .join(GitHubRepo, UserRepo.repo_id == GitHubRepo.id)
                    .where(UserRepo.user_id == user_id, GitHubRepo.gh_id.in_(repo_ids))
                )
                db_repos_result = await self.db.execute(db_repos_query)
                db_repos = db_repos_result.all()
                user_repo_map = {github_repo.gh_id: user_repo for user_repo, github_repo in db_repos}

            tokens_were_reset = False
            for repo in page_repos:
                gh_id = repo.get("gh_id")
                db_repo = user_repo_map.get(gh_id)
                github_repo = github_repo_map.get(gh_id)
                if not db_repo or not github_repo or not db_repo.analyzed_at or not repo["last_commit_date"]:
                    continue

                try:
                    commit_dt = datetime.fromisoformat(repo["last_commit_date"].replace('Z', '+00:00'))
                except ValueError:
                    continue

                if commit_dt > db_repo.analyzed_at and github_repo.tokens is not None:
                    github_repo.tokens = None
                    tokens_were_reset = True

            if tokens_were_reset:
                await self.db.commit()

            async def check_repo_status(repo, client):
                status = "Доступен"
                try:
                    c_response = await client.get(
                        f"https://api.github.com/repos/{viewer_login}/{repo['name']}/contributors?per_page=2",
                        headers={
                            "Accept": "application/vnd.github+json",
                            "Authorization": f"Bearer {access_token}",
                            "X-GitHub-Api-Version": global_config.GITHUB_API_VERSION,
                        }
                    )
                    if c_response.status_code == 200:
                        contributors = c_response.json()
                        if len(contributors) > 1 or (len(contributors) == 1 and contributors[0].get("login") != viewer_login):
                            status = "Недоступен"
                except Exception:
                    pass
                
                analyzed_at_str = None
                db_repo = user_repo_map.get(repo.get("gh_id"))
                github_repo = github_repo_map.get(repo.get("gh_id"))

                if github_repo and analyzer.is_repository_too_large(github_repo.tokens):
                    status = "Недоступен"

                if db_repo:
                    analyzed_at_str = db_repo.analyzed_at.isoformat() if db_repo.analyzed_at else None
                    
                    if db_repo.analyzed_at is None and status != "Недоступен":
                        status = "Подготовка" if github_repo is None or github_repo.tokens is None else "В процессе..."
                    elif status != "Недоступен" and repo["last_commit_date"]:
                        try:
                            commit_dt = datetime.fromisoformat(repo["last_commit_date"].replace('Z', '+00:00'))
                            if db_repo.analyzed_at >= commit_dt:
                                status = "Проверен"
                        except Exception:
                            pass

                return {
                    **repo,
                    "analyzed_at": analyzed_at_str,
                    "status": status
                }

            async with httpx.AsyncClient(timeout=10.0) as client:
                tasks = [check_repo_status(repo, client) for repo in page_repos]
                enriched_repos = await asyncio.gather(*tasks)

            return {
                "items": enriched_repos,
                "total_pages": total_pages,
                "current_page": page,
                "total_items": total_items
            }
            
        except Exception as exc:
            logger.warning("Failed to fetch repositories for user %s: %s", user_id, exc)
            return {"items": [], "total_pages": 0, "current_page": page, "total_items": 0}

    async def disconnect(self, user_id: int) -> None:
        user = await get_user_by_id(self.db, user_id)
        github_profile = await self._get_profile_by_user_id(user_id)
        if user is None or not github_profile:
            return

        encrypted_token = github_profile.github_token
        try:
            access_token = string_cipher.decrypt(
                encrypted_token)
        except ValueError:
            logger.exception("Не удалось расшифровать GitHub token при отвязке для пользователя %s", user_id)
            await self.db.delete(github_profile)
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

        await self.db.delete(github_profile)
        await self.db.commit()

    async def _get_profile_by_user_id(self, user_id: int) -> GitHubProfile | None:
        result = await self.db.execute(
            select(GitHubProfile).where(GitHubProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _upsert_github_profile(
        self,
        user_id: int,
        github_id: int,
        encrypted_token: str,
    ):
        existing_by_id = await self.db.execute(
            select(GitHubProfile).where(GitHubProfile.id == github_id)
        )
        profile = existing_by_id.scalar_one_or_none()
        if profile:
            profile.user_id = user_id
            profile.github_token = encrypted_token
            return

        existing_by_user = await self._get_profile_by_user_id(user_id)
        if existing_by_user:
            existing_by_user.id = github_id
            existing_by_user.github_token = encrypted_token
            return

        self.db.add(GitHubProfile(
            id=github_id,
            user_id=user_id,
            github_token=encrypted_token,
        ))

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

    async def _fetch_github_profile(self, access_token: str) -> GitHubProfileData:
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
        return GitHubProfileData(
            id=payload["id"],
            login=payload["login"],
            name=payload.get("name"),
            avatar_url=payload.get("avatar_url"),
            profile_url=payload.get("html_url"),
        )

    async def _fetch_github_email(self, access_token: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {access_token}",
                    "X-GitHub-Api-Version": global_config.GITHUB_API_VERSION,
                },
            )

        if response.status_code >= 400:
            logger.warning(
                "Ошибка при загрузке email GitHub: status=%s body=%s",
                response.status_code,
                response.text,
            )
            raise httpx.HTTPStatusError(
                "GitHub emails request failed",
                request=response.request,
                response=response,
            )

        emails = response.json()
        primary_email = next(
            (e["email"] for e in emails if e.get("primary") and e.get("verified")),
            None
        )
        if not primary_email:
            # Fallback to any verified email if no primary verified is found
            primary_email = next(
                (e["email"] for e in emails if e.get("verified")),
                None
            )
        
        if not primary_email:
            raise ValueError("Не найден подтвержденный email в профиле GitHub")
        
        return primary_email

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
    def _get_redis(cls):
        return get_redis()

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
