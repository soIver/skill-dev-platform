from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..auth.utils import require_role
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Recommendation, UserRecommendation
from .schemas import RecommendationSearchResponse, RecommendationItem

router = APIRouter(tags=["Recommendations"])

@router.get("/recommendations", response_model=RecommendationSearchResponse)
async def search_recommendations(
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(
        Recommendation.id,
        Recommendation.description,
        Recommendation.is_published,
        func.count(UserRecommendation.id).label("issued_count"),
        func.avg(UserRecommendation.rating).label("average_rating")
    ).outerjoin(UserRecommendation, UserRecommendation.recommendation_id == Recommendation.id)
    
    if keyword:
        query = query.where(Recommendation.description.ilike(f"%{keyword}%"))

    query = query.group_by(Recommendation.id)
    query = query.order_by(func.count(UserRecommendation.id).desc(), Recommendation.id)

    offset = (page - 1) * limit
    
    count_query = select(func.count()).select_from(Recommendation)
    if keyword:
        count_query = count_query.where(Recommendation.description.ilike(f"%{keyword}%"))
        
    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        desc = row.description or ""
        desc_preview = desc[:30] + ("..." if len(desc) > 30 else "")
        
        avg_rating = row.average_rating
        if avg_rating is None or avg_rating == 0:
            rating_str = "-"
        else:
            rating_str = str(round(avg_rating, 1))
            
        status = "Опубликовано" if row.is_published else "Сохранено"
        
        items.append(RecommendationItem(
            id=row.id,
            description_preview=desc_preview,
            issued_count=row.issued_count,
            average_rating=rating_str,
            status=status
        ))

    return RecommendationSearchResponse(
        items=items,
        total_pages=total_pages,
        current_page=page,
    )
