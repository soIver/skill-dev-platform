from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext
from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..models import RefreshToken, User
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

        access_token = self._encode_token(
            {
                "sub": str(user.id),
                "email": user.email,
                "role": user.role,
                "type": "access",
                "jti": uuid4().hex,
            },
            timedelta(minutes=Config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        refresh_jti = uuid4().hex
        refresh_expires_at = now + timedelta(
            minutes=Config.JWT_REFRESH_TOKEN_EXPIRE_MINUTES
        )
        refresh_token = self._encode_token(
            {
                "sub": str(user.id),
                "type": "refresh",
                "jti": refresh_jti,
            },
            timedelta(minutes=Config.JWT_REFRESH_TOKEN_EXPIRE_MINUTES),
        )

        self.db.add(
            RefreshToken(
                user_id=user.id,
                jti=refresh_jti,
                device_id=normalized_device_id,
                expires_at=refresh_expires_at,
            )
        )
        await self.db.commit()

        return TokenPair(access_token=access_token, refresh_token=refresh_token)

    async def refresh_token_pair(
        self, refresh_token: str, device_id: str | None
    ) -> tuple[User, TokenPair]:
        payload = self._decode_token(refresh_token, expected_type="refresh")
        user_id = self._extract_user_id(payload)
        refresh_token_row = await self._get_refresh_token_row(
            user_id=user_id,
            jti=payload["jti"],
        )

        if refresh_token_row is None:
            raise self._invalid_token_error()

        normalized_device_id = self._normalize_device_id(device_id)
        if refresh_token_row.device_id != normalized_device_id:
            raise self._invalid_token_error()

        if refresh_token_row.revoked or refresh_token_row.expires_at <= self._now():
            raise self._invalid_token_error()

        user = await self.db.get(User, user_id)
        if user is None:
            raise self._invalid_token_error()

        refresh_token_row.revoked = True
        token_pair = await self.issue_token_pair(user, refresh_token_row.device_id)
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

        refresh_token_row = await self._get_refresh_token_row(
            user_id=self._extract_user_id(payload),
            jti=payload["jti"],
        )
        if refresh_token_row is None or refresh_token_row.revoked:
            return

        normalized_device_id = self._normalize_device_id(device_id)
        if refresh_token_row.device_id != normalized_device_id:
            return

        refresh_token_row.revoked = True
        await self.db.commit()

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
        await self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.device_id == device_id,
                RefreshToken.revoked.is_(False),
            )
            .values(revoked=True)
        )

    async def _get_refresh_token_row(
        self, user_id: int, jti: str
    ) -> RefreshToken | None:
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.jti == jti,
            )
        )
        return result.scalar_one_or_none()

    def _encode_token(self, payload: dict, expires_delta: timedelta) -> str:
        to_encode = payload.copy()
        to_encode["exp"] = self._now() + expires_delta
        return jwt.encode(
            to_encode,
            Config.JWT_SECRET_KEY,
            algorithm=Config.JWT_ALGORITHM,
        )

    def _decode_token(self, token: str, expected_type: str) -> dict:
        try:
            payload = jwt.decode(
                token,
                Config.JWT_SECRET_KEY,
                algorithms=[Config.JWT_ALGORITHM],
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
        if not Config.REDIS_URL:
            return None
        if cls._redis is None:
            cls._redis = from_url(
                Config.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return cls._redis

    @staticmethod
    def _normalize_device_id(device_id: str | None) -> str:
        return device_id or "unknown-device"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(Config.UTC3)

    @staticmethod
    def _invalid_token_error() -> ValueError:
        return ValueError("Недействительный refresh token")


async def cleanup_expired_refresh_tokens(db: AsyncSession) -> int:
    result = await db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at <= TokenService._now())
    )
    await db.commit()
    return result.rowcount or 0
