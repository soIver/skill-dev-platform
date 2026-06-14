from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import RecommendationListResponse, RecommendationSkipResponse
from .service import RecommendationService
from ..auth.service import TokenClaims
from ..auth.utils import require_role
from ..utils.database import get_db


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=RecommendationListResponse)
async def list_recommendations(
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await RecommendationService(db).list_recommendations(claims.user_id)


@router.post("/{recommendation_id}/skip", response_model=RecommendationSkipResponse)
async def skip_recommendation(
    recommendation_id: str,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await RecommendationService(db).skip_recommendation(
        claims.user_id,
        recommendation_id,
    )
