from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .schemas import AnalyzeRepoRequest
from ..auth.utils import TokenClaims, get_current_user
from ..celery.tasks import analyze_repository_task
from ..utils.database import get_db
from ..models import UserRepo

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/repository", status_code=status.HTTP_202_ACCEPTED)
async def analyze_repo(
    request: AnalyzeRepoRequest,
    claims: TokenClaims = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        query = select(UserRepo).where(
            UserRepo.user_id == claims.user_id,
            UserRepo.name == request.repo_name,
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
                gh_id=0,
                name=request.repo_name,
                analyzed_at=None,
            )
            db.add(repo)

        await db.commit()

        analyze_repository_task.delay(
            user_id=claims.user_id,
            repo_name=request.repo_name,
            repo_url=request.repo_url,
            previous_analyzed_at=previous_analyzed_at,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось запустить задачу: {str(exc)}",
        )

    return {"message": "Задача добавлена в очередь"}
