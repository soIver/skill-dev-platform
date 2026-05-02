from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..config import global_config
from ..models import User, Role
from ..utils.crypto import Hasher, JwtCodec
from ..utils.logger import get_logger

logger = get_logger("auth.service")
password_hasher = Hasher(
    schemes=global_config.PASSWORD_HASH_SCHEMES
)
jwt_codec = JwtCodec(
    secret_key=global_config.JWT_SECRET_KEY,
    algorithm=global_config.JWT_ALGORITHM,
)


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str


class TokenService:
    _redis: Redis | None = None

    def __init__(self, db: AsyncSession):
        self.db = db

    async def issue_token_pair(self, user: User, device_id: str | None) -> TokenPair:
        normalized_device_id = self._normalize_device_id(device_id)
        now = self._now()

        await self._revoke_active_device_tokens(user.id, normalized_device_id)

        role_name = user.role.name if user.role else "user"

        access_token = jwt_codec.encode(
            {
                "sub": str(user.id),
                "username": user.username,
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
        refresh_token = jwt_codec.encode(
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
        self, refresh_token: str | None, device_id: str | None
    ) -> tuple[User, TokenPair]:
        if not refresh_token:
            raise self._invalid_token_error()

        payload = jwt_codec.decode(refresh_token, expected_type="refresh")
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
            payload = jwt_codec.decode(refresh_token, expected_type="refresh")
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
            claims = JwtCodec.get_unverified_claims(access_token)
        except ValueError:
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
            raise RuntimeError("Redis не настроен для хранения токенов обновления")
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


@dataclass(slots=True, frozen=True)
class TokenClaims:
    user_id: int
    username: str
    email: str
    role: str
    jti: str

class AuthService:
    """Фасад для операций аутентификации"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.token_service = TokenService(db)

    async def authenticate(self, identifier: str, password: str) -> User | None:
        result = await self.db.execute(
            select(User).options(joinedload(User.role)).where(
                or_(User.email == identifier, User.username == identifier)
            )
        )
        user = result.unique().scalar_one_or_none()
        if user is None or not password_hasher.verify(password, user.password_hash):
            return None
        return user

    async def register(self, username: str, email: str, password: str) -> User:
        existing_user = await self.db.execute(
            select(User).where(or_(User.email == email, User.username == username))
        )
        existing = existing_user.scalar_one_or_none()
        if existing is not None:
            if existing.email == email:
                raise UserAlreadyExistsError("Пользователь с таким email уже существует")
            raise UserAlreadyExistsError("Пользователь с таким именем уже существует")

        role_result = await self.db.execute(select(Role).where(Role.name == "user"))
        user_role = role_result.scalar_one_or_none()
        if user_role is None:
            raise RuntimeError("Роль user не найдена")

        new_user = User(
            username=username,
            email=email,
            password_hash=password_hasher.hash(password),
            role=user_role,
        )
        self.db.add(new_user)
        await self.db.commit()

        result = await self.db.execute(
            select(User).options(joinedload(User.role)).where(User.id == new_user.id)
        )
        return result.unique().scalar_one()

    async def login(self, identifier: str, password: str, device_id: str | None) -> tuple[User, TokenPair]:
        user = await self.authenticate(identifier, password)
        if not user:
            raise InvalidCredentialsError("Неверный email, логин или пароль")
        token_pair = await self.token_service.issue_token_pair(user, device_id)
        return user, token_pair

    async def refresh(self, refresh_token: str | None, device_id: str | None) -> tuple[User, TokenPair]:
        try:
            return await self.token_service.refresh_token_pair(refresh_token, device_id)
        except ValueError as exc:
            raise InvalidTokenError(str(exc)) from exc

    async def logout(
        self,
        access_token: str | None,
        refresh_token: str | None,
        device_id: str | None,
    ) -> None:
        if refresh_token:
            await self.token_service.revoke_refresh_token(refresh_token, device_id)
        if access_token:
            await self.token_service.blacklist_access_token(access_token)


class InvalidCredentialsError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class UserAlreadyExistsError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class InvalidTokenError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
