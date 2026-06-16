from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import ProgressActivityListResponse
from .service import ProgressActivityService
from ..auth.service import TokenClaims
from ..auth.utils import require_role
from ..utils.database import get_db


router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/actions", response_model=ProgressActivityListResponse)
async def list_progress_actions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await ProgressActivityService(db).list_actions(claims.user_id, page, limit)
