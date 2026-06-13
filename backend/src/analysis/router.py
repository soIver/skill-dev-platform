from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .analysers import analyzer
from .schemas import AnalyzeRepoRequest
from ..auth.utils import TokenClaims, get_current_user
from ..celery.tasks import analyze_repository_task
from ..utils.database import get_db
from ..models import UserRepo, GitHubRepo, SkillLevelTask, SkillLevel, Skill, TaskRequirement

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _parse_github_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.post("/repository", status_code=status.HTTP_202_ACCEPTED)
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
            # защита от повторного анализа неизменённого кода
            if not request.task_id and repo.analyzed_at and commit_dt and repo.analyzed_at >= commit_dt:
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
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось запустить задачу",
        )

    return {"message": "Задача добавлена в очередь"}
