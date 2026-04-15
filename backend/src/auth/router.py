from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .schemas import (
    AuthResponse,
    Credentials,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
)
from .service import TokenPair, TokenService
from .utils import authenticate_user, register_user

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=AuthResponse)
async def login(
    credentials: Credentials,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    token_pair = await TokenService(db).issue_token_pair(user, device_id)
    return _build_auth_response(user, token_pair)


@router.post("/register", response_model=AuthResponse)
async def register(
    credentials: Credentials,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    user = await register_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует",
        )

    token_pair = await TokenService(db).issue_token_pair(user, device_id)
    return _build_auth_response(user, token_pair)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    try:
        user, token_pair = await TokenService(db).refresh_token_pair(
            payload.refresh_token,
            device_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return _build_auth_response(user, token_pair)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None, alias="Authorization"),
    device_id: str | None = Header(default=None, alias="X-Device-Id"),
):
    token_service = TokenService(db)
    await token_service.revoke_refresh_token(payload.refresh_token, device_id)
    await token_service.blacklist_access_token(_extract_bearer_token(authorization))
    return {"message": "Сессия завершена"}


def _build_auth_response(user, token_pair: TokenPair) -> AuthResponse:
    role_name = user.role_rel.name if user.role_rel else "user"
    return AuthResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "role": role_name,
            "githubUsername": user.github_username or "",
        },
    )


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    return token.strip()
