from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlencode

from ..config import global_config
from ..auth.utils import TokenClaims, get_current_user, set_auth_cookies
from ..auth.service import TokenService
from ..utils.database import get_db
from .schemas import (
    GitHubAuthorizationUrlResponse,
    GitHubDisconnectResponse,
    GitHubProfileResponse,
)
from .service import GitHubService

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/connect-url", response_model=GitHubAuthorizationUrlResponse)
async def get_connect_url(
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        authorization_url = await GitHubService(db).create_authorization_url(claims)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"authorization_url": authorization_url}


@router.get("/login-url", response_model=GitHubAuthorizationUrlResponse)
async def get_login_url(
    db: AsyncSession = Depends(get_db),
):
    try:
        authorization_url = await GitHubService(db).create_login_url()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"authorization_url": authorization_url}


@router.get("/callback")
async def github_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    response: Response = None,
    db: AsyncSession = Depends(get_db),
):
    service = GitHubService(db)

    if error:
        return RedirectResponse(
            url=service._build_frontend_redirect_url(
                status="error",
                message=error_description or error,
            ),
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        return RedirectResponse(
            url=service._build_frontend_redirect_url(
                status="error",
                message="GitHub не вернул code или state",
            ),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        result = await service.handle_callback(code=code, state=state)
        
        if isinstance(result, tuple):
            action, data = result
            if action == "connect":
                redirect_url = data
            elif action == "login":
                user = data
                token_service = TokenService(db)
                token_pair = await token_service.issue_token_pair(user, None) # No device_id in redirect
                redirect_url = global_config.GITHUB_FRONTEND_REDIRECT_URL.replace("/profile/credentials", "/profile")
                
                redirect_response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
                set_auth_cookies(redirect_response, token_pair)
                return redirect_response
            elif action == "register":
                query = {
                    "gh_email": data["email"],
                    "gh_login": data["login"],
                    "gh_token_enc": data["gh_token_enc"],
                }
                base_url = global_config.GITHUB_FRONTEND_REDIRECT_URL.replace("/profile/credentials", "/auth/registration")
                redirect_url = f"{base_url}?{urlencode(query)}"
        else:
            redirect_url = result
            
    except (RuntimeError, ValueError) as exc:
        redirect_url = service._build_frontend_redirect_url(
            status="error",
            message=str(exc),
        )

    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get("/profile", response_model=GitHubProfileResponse)
async def get_github_profile(
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        profile = await GitHubService(db).get_connection_profile(claims.user_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if profile is None:
        return {"connected": False}

    return {
        "connected": True,
        "login": profile.login,
        "name": profile.name,
        "avatar_url": profile.avatar_url,
        "profile_url": profile.profile_url,
    }

@router.get("/repos")
async def get_github_repos(
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        repos = await GitHubService(db).get_user_repositories(claims.user_id)
        return repos
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.delete("/connection", response_model=GitHubDisconnectResponse)
async def disconnect_github(
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await GitHubService(db).disconnect(claims.user_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"message": "Профиль GitHub отвязан"}
