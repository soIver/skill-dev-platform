from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .schemas import AnalyzeRepoRequest
from ..auth.utils import TokenClaims, get_current_user
from ..celery.tasks import analyze_repository_task
from ..utils.database import get_db
from ..models import UserRepo, GitHubRepo, SkillLevelTask, SkillLevel, Skill

router = APIRouter(prefix="/analysis", tags=["analysis"])


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

        query = select(UserRepo).where(
            UserRepo.user_id == claims.user_id,
            UserRepo.repo_id == github_repo.id,
        )
        result = await db.execute(query)
        repo = result.scalar_one_or_none()

        previous_analyzed_at: str | None = None

        if repo:
            # защита от повторного анализа неизменённого кода
            if repo.analyzed_at and request.last_commit_date:
                try:
                    commit_dt = datetime.fromisoformat(
                        request.last_commit_date.replace("Z", "+00:00")
                    )
                    if repo.analyzed_at >= commit_dt:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Репозиторий уже проверен для текущей версии кода",
                        )
                except ValueError:
                    pass

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

        await db.commit()

        skill_names: list[str] | None = None
        task_description: str | None = None
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

        analyze_repository_task.delay(
            user_id=claims.user_id,
            repo_name=request.repo_name,
            repo_url=request.repo_url,
            previous_analyzed_at=previous_analyzed_at,
            task_id=request.task_id,
            skill_names=skill_names,
            task_description=task_description,
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось запустить задачу",
        )

    return {"message": "Задача добавлена в очередь"}
