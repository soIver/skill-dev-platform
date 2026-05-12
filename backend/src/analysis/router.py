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
    db: AsyncSession = Depends(get_db)
):
    try:
        query = select(UserRepo).where(UserRepo.user_id == claims.user_id, UserRepo.name == request.repo_name)
        result = await db.execute(query)
        repo = result.scalar_one_or_none()

        if not repo:
            repo = UserRepo(
                user_id=claims.user_id,
                gh_id=0,
                name=request.repo_name,
                analyzed_at=None
            )
            db.add(repo)
        else:
            repo.analyzed_at = None
            
        await db.commit()

        # Enqueue the Celery task
        analyze_repository_task.delay(
            user_id=claims.user_id,
            repo_name=request.repo_name,
            repo_url=request.repo_url
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось запустить задачу: {str(exc)}"
        )

    return {"message": "Задача добавлена в очередь"}
