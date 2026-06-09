from fastapi import APIRouter, Cookie, Depends, Header, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..mail.schemas import (
    PasswordChangeCodeResponse,
    PasswordChangeConfirmRequest,
    PasswordChangeRequestResponse,
)
from ..mail.service import MailService, PasswordChangeRateLimitError
from ..utils.database import get_db
from ..config import global_config
from .schemas import (
    AuthResponse,
    ContentOwnerItem,
    ContentOwnerSearchResponse,
    LoginCredentials,
    MessageResponse,
    RegistrationCredentials,
    UserResponse,
)
from .service import AuthService
from .utils import (
    TokenClaims,
    get_current_user,
    require_role,
    set_auth_cookies,
    clear_auth_cookies,
)
from ..models import Role, User

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=AuthResponse)
async def login(
    credentials: LoginCredentials,
    response: Response,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    auth = AuthService(db)
    user, token_pair = await auth.login(
        credentials.identifier,
        credentials.password,
        device_id,
    )
    set_auth_cookies(response, token_pair)
    return _build_auth_response(user)


@router.post("/register", response_model=AuthResponse)
async def register(
    credentials: RegistrationCredentials,
    response: Response,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    auth = AuthService(db)
    user = await auth.register(
        credentials.username,
        credentials.email,
        credentials.password,
        credentials.github_token,
        credentials.github_id,
    )
    user, token_pair = await auth.login(credentials.email, credentials.password, device_id)
    set_auth_cookies(response, token_pair)
    return _build_auth_response(user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(
    response: Response,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
    refresh_token: str | None = Cookie(
        default=None,
        alias=global_config.AUTH_REFRESH_COOKIE_NAME,
    ),
):
    auth = AuthService(db)
    user, token_pair = await auth.refresh(refresh_token, device_id)
    set_auth_cookies(response, token_pair)
    return _build_auth_response(user)


@router.get("/session", response_model=UserResponse)
async def get_session(claims: TokenClaims = Depends(get_current_user)):
    return UserResponse(
        id=claims.user_id,
        username=claims.username,
        email=claims.email,
        role=claims.role,
    )


@router.post("/password-change/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(get_current_user)):
    mail_service = MailService(db)

    try:
        retry_after = await mail_service.request_password_change(claims.user_id)
    except PasswordChangeRateLimitError as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": "Отправка кода для смены пароля возможна не чаще одного раза в минуту",
                "retry_after_seconds": exc.retry_after_seconds,
            },
        )

    return PasswordChangeRequestResponse(
        message="Письмо с кодом для смены пароля отправлено",
        retry_after_seconds=retry_after,
    )


@router.get("/password-change/verify", response_model=PasswordChangeCodeResponse)
async def verify_password_change_code(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.verify_password_change_code(code)
    return PasswordChangeCodeResponse(message="Код подтверждения корректен")


@router.post("/password-change/confirm", response_model=PasswordChangeCodeResponse)
async def confirm_password_change(payload: PasswordChangeConfirmRequest, response: Response, db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    user = await mail_service.confirm_password_change(payload)
    clear_auth_cookies(response)
    return PasswordChangeCodeResponse(
        message=f"Пароль для пользователя {user.username} успешно изменён!",
        username=user.username,
    )


@router.get("/owners", response_model=ContentOwnerSearchResponse)
async def search_content_owners(
    q: str = Query(default=""),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("admin")),
):
    query = (
        select(User.id, User.username)
        .join(Role, User.role_id == Role.id)
        .where(Role.name.in_(("curator", "admin")))
        .order_by(User.username)
        .limit(limit)
    )

    trimmed_query = q.strip()
    if trimmed_query:
        query = query.where(User.username.ilike(f"%{trimmed_query}%"))

    result = await db.execute(query)
    return ContentOwnerSearchResponse(
        items=[ContentOwnerItem(id=row.id, username=row.username) for row in result.all()]
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
    access_token: str | None = Cookie(
        default=None,
        alias=global_config.AUTH_ACCESS_COOKIE_NAME,
    ),
    refresh_token: str | None = Cookie(
        default=None,
        alias=global_config.AUTH_REFRESH_COOKIE_NAME,
    ),
):
    auth = AuthService(db)
    await auth.logout(access_token, refresh_token, device_id)
    clear_auth_cookies(response)
    return MessageResponse(message="Сессия завершена")


# ── Приватные хелперы роутера ──────────────────────────────

def _build_auth_response(user) -> AuthResponse:
    role_name = user.role.name if user.role else "user"
    return AuthResponse(
        user={
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": role_name,
        }
    )
