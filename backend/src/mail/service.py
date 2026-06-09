from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.service import TokenService, password_hasher
from ..config import global_config
from ..models import User
from ..utils.crypto import generate_urlsafe_token
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .delivery import MailDeliveryService
from .schemas import PasswordChangeConfirmRequest
from .templates import build_action_email_html

logger = get_logger("mail.service")


class PasswordChangeRateLimitError(Exception):
    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds


class MailService:

    def __init__(self, db: AsyncSession, redis: Redis | None = None):
        self.db = db
        self.redis = redis or get_redis()
        self.delivery = MailDeliveryService()

    async def request_password_change(self, user_id: int) -> int:
        retry_after = await self._get_retry_after(user_id)
        if retry_after > 0:
            raise PasswordChangeRateLimitError(retry_after)

        user = await self._get_user(user_id)
        code = generate_urlsafe_token(32)
        action_url = self._build_password_change_url(code)

        await self._replace_password_change_code(user, code)

        try:
            await self.delivery.send_html_email(
                recipient=user.email,
                subject="Восстановление пароля",
                text_body=(
                    "Для смены пароля перейдите по ссылке: "
                    f"{action_url}"
                ),
                html_body=build_action_email_html(
                    "Восстановление пароля",
                    f"Для учётной записи <b>{user.username}</b> было запрошено восстановление пароля.</br></br>Для перехода на страницу восстановления пароля нажмите на кнопку ниже — она будет действительна в течение одного часа с момента получения этого письма.",
                    "Сменить пароль",
                    action_url,
                ),
            )
        except Exception:
            await self._delete_password_change_code(user.id, code)
            logger.exception("Не удалось отправить письмо для смены пароля")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось отправить письмо. Повторите попытку позже",
            )

        await self.redis.set(
            self._password_change_rate_key(user.id),
            "1",
            ex=global_config.MAIL_PASSWORD_CHANGE_RATE_LIMIT_SECONDS,
        )
        return global_config.MAIL_PASSWORD_CHANGE_RATE_LIMIT_SECONDS

    async def request_email_confirmation(self, email: str):
        await self._ensure_email_available(email)

        code = generate_urlsafe_token(32)
        action_url = self._build_email_confirmation_url(code)
        await self._replace_email_confirmation_code(email, code)

        try:
            await self.delivery.send_html_email(
                recipient=email,
                subject="Подтверждение адреса электронной почты",
                text_body=(
                    "Для подтверждения адреса электронной почты перейдите по ссылке: "
                    f"{action_url}"
                ),
                html_body=build_action_email_html(
                    "Подтверждение адреса электронной почты",
                    (
                        "Ваш адрес электронной почты был указан при регистрации "
                        f'на платформе <a href="{global_config.PUBLIC_SITE_URL}">IT Skill Dev</a>.</br></br>'
                        "Для завершения регистрации нажмите на кнопку ниже — "
                        "она будет действительна в течение одного часа с момента получения этого письма.</br></br>"
                        "Если Вы не пытались зарегистрироваться на платформе, игнорируйте это письмо."
                    ),
                    "Подтвердить",
                    action_url,
                ),
            )
        except Exception:
            await self._delete_email_confirmation_code(email, code)
            logger.exception("Не удалось отправить письмо для подтверждения почты")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось отправить письмо. Повторите попытку позже",
            )

    async def verify_email_confirmation_code(self, code: str) -> str:
        code_data = await self._get_email_confirmation_code_data(code)
        return code_data["email"]

    async def consume_email_confirmation_code(self, code: str, email: str):
        code_data = await self._get_email_confirmation_code_data(code)
        if code_data["email"] != email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )
        await self._delete_email_confirmation_code(email, code)

    async def verify_password_change_code(self, code: str):
        await self._get_password_change_code_data(code)

    async def confirm_password_change(self, payload: PasswordChangeConfirmRequest) -> User:
        code_data = await self._get_password_change_code_data(payload.code)
        user = await self._get_user(int(code_data["user_id"]))

        if not password_hasher.verify(payload.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Текущий пароль указан неверно",
            )

        user.password_hash = password_hasher.hash(payload.new_password)
        await self.db.commit()

        await self._delete_password_change_code(user.id, payload.code)

        token_service = TokenService(self.db)
        await token_service.revoke_all_user_sessions(user.id)
        await token_service.invalidate_user_access_tokens(user.id)
        return user

    async def _replace_password_change_code(self, user: User, code: str):
        previous_code = await self.redis.get(self._password_change_active_key(user.id))
        if previous_code:
            await self._delete_password_change_code(user.id, previous_code)

        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                self._password_change_code_key(code),
                mapping={
                    "user_id": str(user.id),
                    "email": user.email,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            pipeline.expire(
                self._password_change_code_key(code),
                global_config.MAIL_CODE_TTL_SECONDS,
            )
            pipeline.set(
                self._password_change_active_key(user.id),
                code,
                ex=global_config.MAIL_CODE_TTL_SECONDS,
            )
            await pipeline.execute()

    async def _replace_email_confirmation_code(self, email: str, code: str):
        previous_code = await self.redis.get(self._email_confirmation_active_key(email))
        if previous_code:
            await self._delete_email_confirmation_code(email, previous_code)

        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                self._email_confirmation_code_key(code),
                mapping={
                    "email": email,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            pipeline.expire(
                self._email_confirmation_code_key(code),
                global_config.MAIL_CODE_TTL_SECONDS,
            )
            pipeline.set(
                self._email_confirmation_active_key(email),
                code,
                ex=global_config.MAIL_CODE_TTL_SECONDS,
            )
            await pipeline.execute()

    async def _delete_password_change_code(self, user_id: int, code: str):
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._password_change_code_key(code))
            pipeline.delete(self._password_change_active_key(user_id))
            await pipeline.execute()

    async def _delete_email_confirmation_code(self, email: str, code: str):
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._email_confirmation_code_key(code))
            pipeline.delete(self._email_confirmation_active_key(email))
            await pipeline.execute()

    async def _get_password_change_code_data(self, code: str) -> dict[str, str]:
        code_data = await self.redis.hgetall(self._password_change_code_key(code))
        if not code_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )
        return code_data

    async def _get_email_confirmation_code_data(self, code: str) -> dict[str, str]:
        code_data = await self.redis.hgetall(self._email_confirmation_code_key(code))
        if not code_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )
        return code_data

    async def _get_retry_after(self, user_id: int) -> int:
        ttl = await self.redis.ttl(self._password_change_rate_key(user_id))
        return ttl if ttl > 0 else 0

    async def _get_user(self, user_id: int) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            )
        return user

    async def _ensure_email_available(self, email: str):
        result = await self.db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с таким email уже существует",
            )

    @staticmethod
    def _build_password_change_url(code: str) -> str:
        return (
            f"{global_config.FRONTEND_BASE_URL.rstrip('/')}"
            f"/auth/change-password?code={quote(code)}"
        )

    @staticmethod
    def _build_email_confirmation_url(code: str) -> str:
        return (
            f"{global_config.FRONTEND_BASE_URL.rstrip('/')}"
            f"/auth/confirm-email?code={quote(code)}"
        )

    @staticmethod
    def _password_change_code_key(code: str) -> str:
        return f"mail:password_change:code:{code}"

    @staticmethod
    def _password_change_active_key(user_id: int) -> str:
        return f"mail:password_change:active:{user_id}"

    @staticmethod
    def _password_change_rate_key(user_id: int) -> str:
        return f"mail:password_change:rate:{user_id}"

    @staticmethod
    def _email_confirmation_code_key(code: str) -> str:
        return f"mail:email_confirmation:code:{code}"

    @staticmethod
    def _email_confirmation_active_key(email: str) -> str:
        return f"mail:email_confirmation:active:{email}"
