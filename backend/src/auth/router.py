from fastapi import APIRouter, Cookie, Depends, Header, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
