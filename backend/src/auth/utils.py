from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError, jwt

from ..config import global_config
from .service import TokenClaims, TokenService


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
        payload = jwt.decode(
            access_token,
            global_config.JWT_SECRET_KEY,
            algorithms=[global_config.JWT_ALGORITHM],
        )
    except JWTError:
        raise _unauthorized()

    if payload.get("type") != "access":
        raise _unauthorized()

    token_jti = payload.get("jti")
    if token_jti:
        redis = TokenService._get_redis()
        if redis:
            try:
                if await redis.get(f"blacklist:access:{token_jti}"):
                    raise _unauthorized()
            except Exception:
                pass  # если Redis недоступен, не блокируем

    try:
        return TokenClaims(
            user_id=int(payload["sub"]),
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


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный токен",
    )