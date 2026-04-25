from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..config import global_config
from ..models import User
from ..logger import get_logger

logger = get_logger("auth.service")


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str


class PasswordService:
    _pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

    @classmethod
    def verify(cls, plain_password: str, hashed_password: str) -> bool:
        return cls._pwd_context.verify(plain_password, hashed_password)

    @classmethod
    def hash(cls, password: str) -> str:
        return cls._pwd_context.hash(password)


class TokenService:
    _redis: Redis | None = None

    def __init__(self, db: AsyncSession):
        self.db = db

    async def issue_token_pair(self, user: User, device_id: str | None) -> TokenPair:
        normalized_device_id = self._normalize_device_id(device_id)
        now = self._now()

        await self._revoke_active_device_tokens(user.id, normalized_device_id)

        role_name = user.role.name if user.role else "user"

        access_token = self._encode_token(
            {
                "sub": str(user.id),
                "email": user.email,
                "role": role_name,
                "type": "access",
                "jti": uuid4().hex,
            },
            timedelta(minutes=global_config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        refresh_jti = uuid4().hex
        refresh_expires_at = now + timedelta(
            minutes=global_config.JWT_REFRESH_TOKEN_EXPIRE_MINUTES
        )
        refresh_token = self._encode_token(
            {
                "sub": str(user.id),
                "type": "refresh",
                "jti": refresh_jti,
            },
            timedelta(minutes=global_config.JWT_REFRESH_TOKEN_EXPIRE_MINUTES),
        )

        await self._store_refresh_token(
            user_id=user.id,
            jti=refresh_jti,
            device_id=normalized_device_id,
            expires_at=refresh_expires_at,
        )

        return TokenPair(access_token=access_token, refresh_token=refresh_token)

    async def refresh_token_pair(
        self, refresh_token: str, device_id: str | None
    ) -> tuple[User, TokenPair]:
        payload = self._decode_token(refresh_token, expected_type="refresh")
        user_id = self._extract_user_id(payload)
        normalized_device_id = self._normalize_device_id(device_id)
        refresh_token_data = await self._get_refresh_token_data(
            user_id=user_id,
            jti=payload["jti"],
        )

        if refresh_token_data is None:
            raise self._invalid_token_error()

        if refresh_token_data["device_id"] != normalized_device_id:
            raise self._invalid_token_error()

        user_result = await self.db.execute(
            select(User).options(joinedload(User.role)).where(User.id == user_id)
        )
        user = user_result.unique().scalar_one_or_none()
        if user is None:
            await self._delete_refresh_token(user_id, payload["jti"], normalized_device_id)
            raise self._invalid_token_error()

        await self._delete_refresh_token(user_id, payload["jti"], normalized_device_id)
        token_pair = await self.issue_token_pair(user, normalized_device_id)
        return user, token_pair

    async def revoke_refresh_token(
        self, refresh_token: str | None, device_id: str | None
    ) -> None:
        if not refresh_token:
            return

        try:
            payload = self._decode_token(refresh_token, expected_type="refresh")
        except ValueError:
            return

        user_id = self._extract_user_id(payload)
        normalized_device_id = self._normalize_device_id(device_id)
        refresh_token_data = await self._get_refresh_token_data(
            user_id=user_id,
            jti=payload["jti"],
        )
        if refresh_token_data is None:
            return

        if refresh_token_data["device_id"] != normalized_device_id:
            return

        await self._delete_refresh_token(user_id, payload["jti"], normalized_device_id)

    async def blacklist_access_token(self, access_token: str | None) -> None:
        if not access_token:
            return

        try:
            claims = jwt.get_unverified_claims(access_token)
        except JWTError:
            return

        token_jti = claims.get("jti")
        expires_at = claims.get("exp")
        if not token_jti or not expires_at:
            return

        ttl_seconds = int(
            (
                datetime.fromtimestamp(expires_at, tz=timezone.utc)
                - datetime.now(timezone.utc)
            ).total_seconds()
        )
        if ttl_seconds <= 0:
            return

        redis = self._get_redis()
        if redis is None:
            return

        try:
            await redis.setex(f"blacklist:access:{token_jti}", ttl_seconds, "1")
        except RedisError as exc:
            logger.warning("Не удалось записать access token в Redis blacklist: %s", exc)

    async def _revoke_active_device_tokens(self, user_id: int, device_id: str) -> None:
        redis = self._require_redis()
        active_jti = await redis.get(self._device_key(user_id, device_id))
        if not active_jti:
            return

        async with redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._refresh_key(user_id, active_jti))
            pipeline.delete(self._device_key(user_id, device_id))
            await pipeline.execute()

    async def _store_refresh_token(
        self,
        user_id: int,
        jti: str,
        device_id: str,
        expires_at: datetime,
    ) -> None:
        redis = self._require_redis()
        ttl_seconds = int((expires_at - self._now()).total_seconds())
        if ttl_seconds <= 0:
            raise self._invalid_token_error()

        async with redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                self._refresh_key(user_id, jti),
                mapping={
                    "user_id": str(user_id),
                    "device_id": device_id,
                    "expires_at": expires_at.isoformat(),
                },
            )
            pipeline.expire(self._refresh_key(user_id, jti), ttl_seconds)
            pipeline.set(self._device_key(user_id, device_id), jti, ex=ttl_seconds)
            await pipeline.execute()

    async def _get_refresh_token_data(
        self, user_id: int, jti: str
    ) -> dict[str, str] | None:
        redis = self._require_redis()
        refresh_token_data = await redis.hgetall(self._refresh_key(user_id, jti))
        if not refresh_token_data:
            return None
        return refresh_token_data

    async def _delete_refresh_token(self, user_id: int, jti: str, device_id: str) -> None:
        redis = self._require_redis()
        async with redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._refresh_key(user_id, jti))
            pipeline.delete(self._device_key(user_id, device_id))
            await pipeline.execute()

    def _encode_token(self, payload: dict, expires_delta: timedelta) -> str:
        to_encode = payload.copy()
        to_encode["exp"] = self._now() + expires_delta
        return jwt.encode(
            to_encode,
            global_config.JWT_SECRET_KEY,
            algorithm=global_config.JWT_ALGORITHM,
        )

    def _decode_token(self, token: str, expected_type: str) -> dict:
        try:
            payload = jwt.decode(
                token,
                global_config.JWT_SECRET_KEY,
                algorithms=[global_config.JWT_ALGORITHM],
            )
        except JWTError as exc:
            raise self._invalid_token_error() from exc

        if payload.get("type") != expected_type or not payload.get("jti"):
            raise self._invalid_token_error()

        return payload

    def _extract_user_id(self, payload: dict) -> int:
        try:
            return int(payload["sub"])
        except (KeyError, TypeError, ValueError) as exc:
            raise self._invalid_token_error() from exc

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
            raise RuntimeError("Redis не настроен для хранения refresh token")
        return redis

    @staticmethod
    def _refresh_key(user_id: int, jti: str) -> str:
        return f"auth:refresh:{user_id}:{jti}"

    @staticmethod
    def _device_key(user_id: int, device_id: str) -> str:
        return f"auth:refresh:device:{user_id}:{device_id}"

    @staticmethod
    def _normalize_device_id(device_id: str | None) -> str:
        return device_id or "unknown-device"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _invalid_token_error() -> ValueError:
        return ValueError("Недействительный refresh token")


# === Dependencies для защиты эндпоинтов ===


@dataclass(slots=True, frozen=True)
class TokenClaims:
    user_id: int
    email: str
    role: str
    jti: str


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> TokenClaims:
    """Извлекает claims из access token. Проверяет подпись и blacklist."""
    if not authorization:
        raise _unauthorized()

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()

    try:
        payload = jwt.decode(
            token.strip(),
            global_config.JWT_SECRET_KEY,
            algorithms=[global_config.JWT_ALGORITHM],
        )
    except JWTError:
        raise _unauthorized()

    if payload.get("type") != "access":
        raise _unauthorized()

    # проверка blacklist
    token_jti = payload.get("jti")
    if token_jti:
        redis = TokenService._get_redis()
        if redis:
            try:
                blacklisted = await redis.get(f"blacklist:access:{token_jti}")
                if blacklisted:
                    raise _unauthorized()
            except RedisError:
                pass  # если redis недоступ — не блокируем

    try:
        return TokenClaims(
            user_id=int(payload["sub"]),
            email=payload["email"],
            role=payload["role"],
            jti=payload["jti"],
        )
    except (KeyError, TypeError, ValueError):
        raise _unauthorized()


def require_role(*allowed_roles: str):
    """Dependency factory: разрешает доступ только указанным ролям."""
    async def _check_role(claims: TokenClaims = Depends(get_current_user)):
        if claims.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Доступ запрещён. Требуется одна из ролей: {', '.join(allowed_roles)}",
            )
        return claims

    return _check_role


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный токен",
    )
