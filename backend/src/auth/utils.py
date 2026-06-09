from fastapi import Cookie, Depends, HTTPException, Response, status

from ..config import global_config
from ..utils.crypto import JwtCodec
from .service import TokenClaims, TokenPair, TokenService

jwt_codec = JwtCodec(
    secret_key=global_config.JWT_SECRET_KEY,
    algorithm=global_config.JWT_ALGORITHM,
)


async def get_current_user(
    access_token: str | None = Cookie(
        default=None,
        alias=global_config.AUTH_ACCESS_COOKIE_NAME,
    ),
) -> TokenClaims:
    """Проверяет подпись токена и наличие в чёрном списке"""
    if not access_token:
        raise _unauthorized()

    try:
        payload = jwt_codec.decode(
            access_token,
            expected_type="access",
        )
    except ValueError:
        raise _unauthorized()

    token_jti = payload.get("jti")
    if token_jti:
        redis = TokenService._get_redis()
        if redis:
            try:
                if await redis.get(f"blacklist:access:{token_jti}"):
                    raise _unauthorized()
                valid_after = await TokenService.get_access_valid_after(int(payload["sub"]))
                issued_at = payload.get("iat")
                if valid_after is not None and (
                    issued_at is None or float(issued_at) < valid_after
                ):
                    raise _unauthorized()
            except HTTPException:
                raise
            except Exception:
                pass  # если Redis недоступен, не блокируем

    try:
        return TokenClaims(
            user_id=int(payload["sub"]),
            username=payload["username"],
            email=payload["email"],
            role=payload["role"],
            jti=payload["jti"],
        )
    except (KeyError, TypeError, ValueError):
        raise _unauthorized()


def require_role(*allowed_roles: str):
    """Разрешает доступ только указанным ролям"""
    async def _check_role(claims: TokenClaims = Depends(get_current_user)):
        if claims.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return claims
    return _check_role


def resolve_author_filter(claims: TokenClaims, author_id: int | None) -> int | None:
    if author_id is None:
        return None
    if claims.role == "admin":
        return author_id
    if claims.role == "curator" and author_id == claims.user_id:
        return author_id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Недостаточно прав",
    )


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный токен",
    )


def set_auth_cookies(response: Response, token_pair: TokenPair) -> None:
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


def clear_auth_cookies(response: Response) -> None:
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
