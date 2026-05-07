from fastapi import APIRouter, Depends, HTTPException, status

from .schemas import AnalyzeRepoRequest
from ..auth.utils import TokenClaims, get_current_user
from ..celery.tasks import analyze_repository_task

router = APIRouter(prefix="/analysis", tags=["analysis"])



@router.post("/repository", status_code=status.HTTP_202_ACCEPTED)
async def analyze_repo(
    request: AnalyzeRepoRequest,
    claims: TokenClaims = Depends(get_current_user),
):
    try:
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
