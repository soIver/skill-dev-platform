from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..mail.schemas import (
    PasswordChangeCodeResponse,
    PasswordChangeConfirmRequest,
    PasswordChangeRequestResponse,
)
from ..mail.service import EmailChangeRateLimitError, MailService, PasswordChangeRateLimitError
from ..management.schemas import (
    CuratorInvitationConfirmRequest,
    CuratorInvitationConfirmResponse,
)
from ..management.service import ManagementService
from ..utils.database import get_db
from ..config import global_config
from .schemas import (
    AuthResponse,
    ContentOwnerItem,
    ContentOwnerSearchResponse,
    EmailConfirmationRequest,
    EmailConfirmationResponse,
    EmailConfirmationVerifyResponse,
    EmailChangeConfirmRequest,
    EmailChangeNewAddressRequest,
    EmailRegistrationCompleteRequest,
    LoginCredentials,
    MessageResponse,
    PasswordRecoveryRequest,
    RegistrationCredentials,
    UsernameAvailabilityResponse,
    UsernameUpdateRequest,
    UserResponse,
    validate_username_value,
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
    if not credentials.github_token or credentials.github_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для регистрации необходимо подтвердить адрес электронной почты",
        )

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


@router.get("/username-availability", response_model=UsernameAvailabilityResponse)
async def check_username_availability(username: str = Query(...), db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(get_current_user)):
    try:
        valid_username = validate_username_value(username)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    auth = AuthService(db)
    return UsernameAvailabilityResponse(
        available=await auth.is_username_available(valid_username, claims.user_id)
    )


@router.patch("/username", response_model=AuthResponse)
async def update_username(
    payload: UsernameUpdateRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(get_current_user),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    auth = AuthService(db)
    user = await auth.update_username(claims.user_id, payload.username)
    token_pair = await auth.token_service.issue_token_pair(user, device_id)
    set_auth_cookies(response, token_pair)
    return _build_auth_response(user)


@router.post("/email-confirmation/request", response_model=EmailConfirmationResponse)
async def request_email_confirmation(payload: EmailConfirmationRequest, db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.request_email_confirmation(payload.email)
    return EmailConfirmationResponse(message="Письмо с инструкцией для подтверждения отправлено")


@router.get("/email-confirmation/verify", response_model=EmailConfirmationVerifyResponse)
async def verify_email_confirmation(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    try:
        email = await mail_service.verify_email_confirmation_code(code)
        return EmailConfirmationVerifyResponse(email=email)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_404_NOT_FOUND:
            raise

    email = await ManagementService(db).verify_registration_invitation_code(code)
    return EmailConfirmationVerifyResponse(email=email, invitation_role="curator")


@router.post("/email-confirmation/complete", response_model=EmailConfirmationResponse)
async def complete_email_registration(payload: EmailRegistrationCompleteRequest, db: AsyncSession = Depends(get_db)):
    management_service = ManagementService(db)
    invitation_data = await management_service.get_registration_invitation_data(payload.code)
    if invitation_data is not None:
        await management_service.register_invited_curator(
            payload.code,
            payload.username,
            payload.email,
            payload.password,
        )
        return EmailConfirmationResponse(message="Адрес почты успешно подтверждён!")

    mail_service = MailService(db)
    confirmed_email = await mail_service.verify_email_confirmation_code(payload.code)
    if confirmed_email != payload.email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Код подтверждения не найден",
        )
    auth = AuthService(db)
    await auth.register(payload.username, payload.email, payload.password)
    await mail_service.consume_email_confirmation_code(payload.code, payload.email)
    return EmailConfirmationResponse(message="Адрес почты успешно подтверждён!")


@router.post("/curator-invitation/confirm", response_model=CuratorInvitationConfirmResponse)
async def confirm_curator_invitation(
    payload: CuratorInvitationConfirmRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    await ManagementService(db).confirm_role_invitation(payload.code)
    clear_auth_cookies(response)
    return CuratorInvitationConfirmResponse(
        message="Ваша роль успешно изменена на «Куратор контента»!"
    )


@router.post("/recovery/password/request", response_model=PasswordChangeRequestResponse)
async def request_password_change(payload: PasswordRecoveryRequest, db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)

    try:
        retry_after = await mail_service.request_password_change(payload.email)
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


@router.post("/recovery/email/request", response_model=EmailConfirmationResponse)
async def request_email_change(db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(get_current_user)):
    mail_service = MailService(db)

    try:
        retry_after = await mail_service.request_email_change(claims.user_id)
    except EmailChangeRateLimitError as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": exc.detail,
                "retry_after_seconds": exc.retry_after_seconds,
            },
        )

    return EmailConfirmationResponse(
        message="Письмо с кодом для смены почты отправлено",
        retry_after_seconds=retry_after,
    )


@router.get("/recovery/email/verify", response_model=EmailConfirmationResponse)
async def verify_email_change_code(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.verify_email_change_code(code)
    return EmailConfirmationResponse(message="Код подтверждения корректен")


@router.post("/recovery/email/request-confirmation", response_model=EmailConfirmationResponse)
async def request_email_change_confirmation(payload: EmailChangeNewAddressRequest, db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.request_email_change_confirmation(payload.code, payload.email)
    return EmailConfirmationResponse(message="Письмо для подтверждения нового адреса отправлено")


@router.post("/recovery/email/confirm", response_model=EmailConfirmationResponse)
async def confirm_email_change(payload: EmailChangeConfirmRequest, response: Response, db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.confirm_email_change(payload.code)
    clear_auth_cookies(response)
    return EmailConfirmationResponse(message="Адрес электронной почты успешно изменён!")


@router.get("/recovery/password/verify", response_model=PasswordChangeCodeResponse)
async def verify_password_change_code(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    mail_service = MailService(db)
    await mail_service.verify_password_change_code(code)
    return PasswordChangeCodeResponse(message="Код подтверждения корректен")


@router.post("/recovery/password/confirm", response_model=PasswordChangeCodeResponse)
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
