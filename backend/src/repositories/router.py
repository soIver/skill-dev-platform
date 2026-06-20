from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlencode

from ..config import global_config
from ..auth.utils import TokenClaims, get_current_user, set_auth_cookies
from ..auth.service import TokenService
from ..analysis.analysers import analyzer
from ..celery.tasks import analyze_repository_task
from ..models import GitHubRepo, Skill, SkillLevel, SkillLevelTask, TaskRequirement, UserRepo
from ..utils.database import get_db
from .schemas import (
    AnalyzeRepoRequest,
    GitHubAuthorizationUrlResponse,
    GitHubDisconnectResponse,
    GitHubProfileResponse,
)
from .service import GitHubService

router = APIRouter(prefix="/github", tags=["github"])


def _parse_github_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


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
            elif action == "connect_error":
                redirect_url = service._build_frontend_redirect_url(status="error", message=data)
            elif action == "login":
                user = data
                token_service = TokenService(db)
                token_pair = await token_service.issue_token_pair(user, None) # No device_id in redirect
                redirect_url = global_config.frontend_url(global_config.GITHUB_LOGIN_REDIRECT_PATH)
                
                redirect_response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
                set_auth_cookies(redirect_response, token_pair)
                return redirect_response
            elif action == "register":
                query = {
                    "gh_id": str(data["gh_id"]),
                    "gh_email": data["email"],
                    "gh_login": data["login"],
                    "gh_token_enc": data["gh_token_enc"],
                }
                base_url = global_config.frontend_url(global_config.GITHUB_REGISTRATION_REDIRECT_PATH)
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
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        repos_data = await GitHubService(db).get_user_repositories(claims.user_id, page=page, limit=limit)
        return repos_data
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/analyze", status_code=status.HTTP_202_ACCEPTED)
async def analyze_repo(
    request: AnalyzeRepoRequest,
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        github_repo = None
        if request.gh_id is not None:
            github_repo_result = await db.execute(
                select(GitHubRepo).where(GitHubRepo.gh_id == request.gh_id)
            )
            github_repo = github_repo_result.scalar_one_or_none()
        if github_repo is None:
            github_repo_result = await db.execute(
                select(GitHubRepo).where(GitHubRepo.url == request.repo_url)
            )
            github_repo = github_repo_result.scalar_one_or_none()

        if github_repo is None:
            github_repo = GitHubRepo(
                gh_id=request.gh_id,
                name=request.repo_name,
                url=request.repo_url,
            )
            db.add(github_repo)
            await db.flush()
        else:
            github_repo.gh_id = request.gh_id if request.gh_id is not None else github_repo.gh_id
            github_repo.name = request.repo_name
            github_repo.url = request.repo_url

        commit_dt = _parse_github_datetime(request.last_commit_date)

        query = select(UserRepo).where(
            UserRepo.user_id == claims.user_id,
            UserRepo.repo_id == github_repo.id,
        )
        result = await db.execute(query)
        repo = result.scalar_one_or_none()

        previous_analyzed_at: str | None = None

        if repo:
            if repo.analyzed_at and commit_dt and repo.analyzed_at >= commit_dt:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Репозиторий уже проверен для текущей версии кода",
                )

            if repo.analyzed_at and commit_dt and commit_dt > repo.analyzed_at:
                github_repo.tokens = None

            previous_analyzed_at = (
                repo.analyzed_at.isoformat() if repo.analyzed_at else None
            )
            repo.analyzed_at = None
        else:
            repo = UserRepo(
                user_id=claims.user_id,
                repo_id=github_repo.id,
                analyzed_at=None,
            )
            db.add(repo)

        if analyzer.is_repository_too_large(github_repo.tokens):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Репозиторий слишком большой для автоматического анализа.",
            )

        await db.commit()

        skill_names: list[str] | None = None
        task_description: str | None = None
        task_requirements: list[dict] | None = None
        if request.task_id:
            from ..models import Task
            task_query = select(Task).where(Task.id == request.task_id)
            task_res = await db.execute(task_query)
            task_obj = task_res.scalar_one_or_none()

            if task_obj:
                task_description = f"{task_obj.title}: {task_obj.description}"

            skills_query = (
                select(Skill.name)
                .join(SkillLevel, SkillLevel.skill_id == Skill.id)
                .join(SkillLevelTask, SkillLevelTask.skill_level_id == SkillLevel.id)
                .where(SkillLevelTask.task_id == request.task_id)
            )
            skills_result = await db.execute(skills_query)
            skill_names = [row for row in skills_result.scalars()]

            requirements_result = await db.execute(
                select(TaskRequirement.id, TaskRequirement.description)
                .where(TaskRequirement.task_id == request.task_id)
                .order_by(TaskRequirement.id)
            )
            task_requirements = [
                {"id": row.id, "description": row.description}
                for row in requirements_result.all()
            ]

        analyze_repository_task.delay(
            user_id=claims.user_id,
            repo_name=request.repo_name,
            repo_url=request.repo_url,
            previous_analyzed_at=previous_analyzed_at,
            task_id=request.task_id,
            skill_names=skill_names,
            task_description=task_description,
            task_requirements=task_requirements,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось запустить задачу",
        ) from exc

    return {"message": "Задача добавлена в очередь"}


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
