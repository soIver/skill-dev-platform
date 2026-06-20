from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..auth.service import AuthService, TokenService
from ..config import global_config
from ..mail.delivery import MailDeliveryService
from ..mail.templates import build_action_email_html
from ..models import Role, SkillLevel, Task, Test, User
from ..utils.crypto import generate_urlsafe_token
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .schemas import CuratorManagementItem, CuratorManagementResponse

logger = get_logger("management.service")

INVITATION_TYPE_REGISTRATION = "registration"
INVITATION_TYPE_ROLE = "role"


class ManagementService:

    def __init__(self, db: AsyncSession, redis: Redis | None = None):
        self.db = db
        self.redis = redis or get_redis()
        self.delivery = MailDeliveryService()

    async def list_curators(
        self,
        query: str,
        page: int,
        limit: int,
    ) -> CuratorManagementResponse:
        normalized_query = query.strip()
        users = await self._load_curator_users(normalized_query)
        invitations = await self._load_pending_invitations(normalized_query)
        items = users + invitations
        total_pages = (len(items) + limit - 1) // limit if items else 1
        safe_page = min(page, total_pages)
        start = (safe_page - 1) * limit

        return CuratorManagementResponse(
            items=items[start:start + limit],
            total_pages=total_pages,
            current_page=safe_page,
        )

    async def can_invite_curator(self, email: str) -> tuple[bool, str | None]:
        user = await self._get_user_by_email(email)
        if user is not None and user.role and user.role.name in {"curator", "admin"}:
            return False, "Пользователь уже является куратором контента"
        return True, None

    async def request_curator_invitation(self, email: str) -> str:
        user = await self._get_user_by_email(email)

        if user is not None and user.role and user.role.name in {"curator", "admin"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь уже является куратором контента",
            )

        code = generate_urlsafe_token(32)
        invitation_type = INVITATION_TYPE_ROLE if user is not None else INVITATION_TYPE_REGISTRATION
        await self._replace_invitation_code(
            email=email,
            code=code,
            invitation_type=invitation_type,
            user_id=user.id if user else None,
        )

        try:
            if invitation_type == INVITATION_TYPE_REGISTRATION:
                await self._send_registration_invitation(email, code)
                return "Письмо с приглашением к регистрации отправлено"
            await self._send_role_invitation(user, code)
            return "Письмо с приглашением на роль куратора отправлено"
        except Exception:
            await self.delete_invitation(email)
            logger.exception("Не удалось отправить письмо с приглашением куратора")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось отправить письмо. Повторите попытку позже",
            )

    async def delete_invitation(self, email: str):
        active_code = await self.redis.get(self._invitation_active_key(email))
        if not active_code:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Приглашение не найдено",
            )

        await self._delete_invitation_code(email, active_code)

    async def verify_registration_invitation_code(self, code: str) -> str:
        code_data = await self._get_invitation_code_data(code)
        if not code_data or code_data.get("type") != INVITATION_TYPE_REGISTRATION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )
        return code_data["email"]

    async def get_registration_invitation_data(self, code: str) -> dict[str, str] | None:
        code_data = await self._get_invitation_code_data(code)
        if not code_data or code_data.get("type") != INVITATION_TYPE_REGISTRATION:
            return None
        return code_data

    async def consume_registration_invitation(self, code: str, email: str):
        code_data = await self.get_registration_invitation_data(code)
        if not code_data or code_data["email"] != email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )
        await self._delete_invitation_code(email, code)

    async def confirm_role_invitation(self, code: str) -> User:
        code_data = await self._get_invitation_code_data(code)
        if not code_data or code_data.get("type") != INVITATION_TYPE_ROLE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )

        user = await self._get_user_by_email(code_data["email"])
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            )
        if user.role and user.role.name == "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Роль администратора нельзя изменить",
            )

        curator_role = await self._get_role("curator")
        user.role_id = curator_role.id
        await self.db.commit()
        await self._delete_invitation_code(user.email, code)

        token_service = TokenService(self.db)
        await token_service.revoke_all_user_sessions(user.id)
        await token_service.invalidate_user_access_tokens(user.id)
        return user

    async def revoke_curator_role(self, user_id: int):
        result = await self.db.execute(
            select(User).options(joinedload(User.role)).where(User.id == user_id)
        )
        user = result.unique().scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            )
        if user.role and user.role.name == "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Роль администратора нельзя отозвать",
            )
        if not user.role or user.role.name != "curator":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь не является куратором контента",
            )

        user_role = await self._get_role("user")
        user.role_id = user_role.id
        await self.db.commit()

        token_service = TokenService(self.db)
        await token_service.revoke_all_user_sessions(user.id)
        await token_service.invalidate_user_access_tokens(user.id)

    async def register_invited_curator(self, code: str, username: str, email: str, password: str) -> User:
        code_data = await self.get_registration_invitation_data(code)
        if not code_data or code_data["email"] != email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Код подтверждения не найден",
            )

        auth = AuthService(self.db)
        user = await auth.register(username, email, password, role_name="curator")
        await self.consume_registration_invitation(code, email)
        return user

    async def _load_curator_users(self, query: str) -> list[CuratorManagementItem]:
        tests_count = (
            select(func.count(Test.id))
            .where(Test.author_id == User.id)
            .correlate(User)
            .scalar_subquery()
        )
        skills_count = (
            select(func.count(SkillLevel.id))
            .where(SkillLevel.author_id == User.id)
            .correlate(User)
            .scalar_subquery()
        )
        tasks_count = (
            select(func.count(Task.id))
            .where(Task.author_id == User.id)
            .correlate(User)
            .scalar_subquery()
        )
        stmt = (
            select(
                User.id,
                User.username,
                User.email,
                Role.name.label("role"),
                tests_count.label("tests_count"),
                skills_count.label("skills_count"),
                tasks_count.label("tasks_count"),
            )
            .join(Role, User.role_id == Role.id)
            .where(Role.name.in_(("curator", "admin")))
            .order_by(User.username)
        )

        if query:
            stmt = stmt.where(
                or_(User.username.ilike(f"%{query}%"), User.email.ilike(f"%{query}%"))
            )

        result = await self.db.execute(stmt)
        return [
            CuratorManagementItem(
                id=row.id,
                kind="user",
                username=row.username,
                email=row.email,
                role=row.role,
                tests_count=row.tests_count,
                skills_count=row.skills_count,
                tasks_count=row.tasks_count,
            )
            for row in result.all()
        ]

    async def _load_pending_invitations(self, query: str) -> list[CuratorManagementItem]:
        invitations: list[CuratorManagementItem] = []

        try:
            async for key in self.redis.scan_iter(match="management:curator_invitation:active:*"):
                email = key.rsplit(":", 1)[-1]
                if query and query.lower() not in email.lower():
                    continue

                code = await self.redis.get(key)
                if not code:
                    continue

                code_data = await self._get_invitation_code_data(code)
                if not code_data:
                    continue

                invitations.append(
                    CuratorManagementItem(
                        id=f"invitation:{email}",
                        kind="invitation",
                        email=email,
                    )
                )
        except RedisError as exc:
            logger.warning("Не удалось загрузить приглашения кураторов из Redis: %s", exc)

        return sorted(invitations, key=lambda item: item.email)

    async def _send_registration_invitation(self, email: str, code: str):
        action_url = self._build_registration_invitation_url(code)
        await self.delivery.send_html_email(
            recipient=email,
            subject="Приглашение на платформу IT Skill Dev",
            text_body=(
                "Вы были приглашены на платформу IT Skill Dev как куратор контента. "
                f"Для завершения регистрации перейдите по ссылке: {action_url}"
            ),
            html_body=build_action_email_html(
                "Приглашение на платформу IT Skill Dev",
                (
                    "Вы были приглашены на платформу IT Skill Dev как куратор контента.</br></br>"
                    "Для завершения регистрации нажмите на кнопку ниже — "
                    "она будет действительна в течение одного часа с момента получения этого письма."
                ),
                "Завершить регистрацию",
                action_url,
            ),
        )

    async def _send_role_invitation(self, user: User, code: str):
        action_url = self._build_role_invitation_url(code)
        await self.delivery.send_html_email(
            recipient=user.email,
            subject="Приглашение на роль куратора контента",
            text_body=(
                "Вы были приглашены на роль куратора контента. "
                f"Для принятия приглашения перейдите по ссылке: {action_url}"
            ),
            html_body=build_action_email_html(
                "Приглашение на роль куратора контента",
                (
                    f"Для учётной записи <b>{user.username}</b> было отправлено приглашение "
                    "на роль куратора контента.</br></br>"
                    "Для принятия приглашения нажмите на кнопку ниже — "
                    "она будет действительна в течение одного часа с момента получения этого письма."
                ),
                "Принять приглашение",
                action_url,
            ),
        )

    async def _replace_invitation_code(
        self,
        email: str,
        code: str,
        invitation_type: str,
        user_id: int | None,
    ):
        previous_code = await self.redis.get(self._invitation_active_key(email))
        if previous_code:
            await self._delete_invitation_code(email, previous_code)

        mapping = {
            "email": email,
            "type": invitation_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if user_id is not None:
            mapping["user_id"] = str(user_id)

        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(self._invitation_code_key(code), mapping=mapping)
            pipeline.expire(self._invitation_code_key(code), global_config.MAIL_CODE_TTL_SECONDS)
            pipeline.set(
                self._invitation_active_key(email),
                code,
                ex=global_config.MAIL_CODE_TTL_SECONDS,
            )
            await pipeline.execute()

    async def _delete_invitation_code(self, email: str, code: str):
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._invitation_code_key(code))
            pipeline.delete(self._invitation_active_key(email))
            await pipeline.execute()

    async def _get_invitation_code_data(self, code: str) -> dict[str, str] | None:
        code_data = await self.redis.hgetall(self._invitation_code_key(code))
        return code_data or None

    async def _get_user_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).options(joinedload(User.role)).where(User.email == email)
        )
        return result.unique().scalar_one_or_none()

    async def _get_role(self, role_name: str) -> Role:
        result = await self.db.execute(select(Role).where(Role.name == role_name))
        role = result.scalar_one_or_none()
        if role is None:
            raise RuntimeError(f"Роль {role_name} не найдена")
        return role

    @staticmethod
    def _build_registration_invitation_url(code: str) -> str:
        return (
            f"{global_config.frontend_url('/auth/confirm-email')}"
            f"?code={quote(code)}"
        )

    @staticmethod
    def _build_role_invitation_url(code: str) -> str:
        return (
            f"{global_config.frontend_url('/auth/confirm-curator')}"
            f"?code={quote(code)}"
        )

    @staticmethod
    def _invitation_code_key(code: str) -> str:
        return f"management:curator_invitation:code:{code}"

    @staticmethod
    def _invitation_active_key(email: str) -> str:
        return f"management:curator_invitation:active:{email}"
