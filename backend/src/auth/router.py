from fastapi import APIRouter, Cookie, Depends, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..utils.database import get_db
from ..config import global_config
from .schemas import (
    AuthResponse,
    LoginCredentials,
    MessageResponse,
    RegistrationCredentials,
    UserResponse,
)
from .service import AuthService, TokenPair
from .utils import TokenClaims, get_current_user

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
    _set_auth_cookies(response, token_pair)
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
    )
    user, token_pair = await auth.login(credentials.email, credentials.password, device_id)
    _set_auth_cookies(response, token_pair)
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
    _set_auth_cookies(response, token_pair)
    return _build_auth_response(user)


@router.get("/session", response_model=UserResponse)
async def get_session(claims: TokenClaims = Depends(get_current_user)):
    return UserResponse(
        id=claims.user_id,
        username=claims.username,
        email=claims.email,
        role=claims.role,
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
    _clear_auth_cookies(response)
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


def _set_auth_cookies(response: Response, token_pair: TokenPair) -> None:
    secure = global_config.auth_cookie_secure()
    response.set_cookie(
        key=global_config.AUTH_ACCESS_COOKIE_NAME,
        value=token_pair.access_token,
        max_age=global_config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=global_config.AUTH_COOKIE_HTTPONLY,
        secure=secure,
        samesite="lax",
        path=global_config.AUTH_ACCESS_COOKIE_PATH,
    )
    response.set_cookie(
        key=global_config.AUTH_REFRESH_COOKIE_NAME,
        value=token_pair.refresh_token,
        max_age=global_config.JWT_REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        httponly=global_config.AUTH_COOKIE_HTTPONLY,
        secure=secure,
        samesite="strict",
        path=global_config.AUTH_REFRESH_COOKIE_PATH,
    )


def _clear_auth_cookies(response: Response) -> None:
    secure = global_config.auth_cookie_secure()
    response.delete_cookie(
        key=global_config.AUTH_ACCESS_COOKIE_NAME,
        path=global_config.AUTH_ACCESS_COOKIE_PATH,
        httponly=global_config.AUTH_COOKIE_HTTPONLY,
        secure=secure,
        samesite="lax",
    )
    response.delete_cookie(
        key=global_config.AUTH_REFRESH_COOKIE_NAME,
        path=global_config.AUTH_REFRESH_COOKIE_PATH,
        httponly=global_config.AUTH_COOKIE_HTTPONLY,
        secure=secure,
        samesite="strict",
    )
