from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from ..auth.utils import require_role
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Recommendation, UserRecommendation, SkillRecommendation, Proficiency, Skill, Level
from .schemas import (
    RecommendationSearchResponse, 
    RecommendationItem, 
    RecommendationDetail, 
    SkillRecommendationItem, 
    RecommendationCreateUpdate
)

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

@router.get("/recommendations/{rec_id}", response_model=RecommendationDetail)
async def get_recommendation(
    rec_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(Recommendation).where(Recommendation.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()
    
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    skills_query = (
        select(SkillRecommendation, Proficiency, Skill, Level)
        .join(Proficiency, SkillRecommendation.proficiency_id == Proficiency.id)
        .join(Skill, Proficiency.skill_id == Skill.id)
        .join(Level, Proficiency.level_id == Level.id)
        .where(SkillRecommendation.recommendation_id == rec_id)
    )
    skills_result = await db.execute(skills_query)
    
    skills_items = []
    for sr, sl, sk, lv in skills_result.all():
        skills_items.append(SkillRecommendationItem(
            proficiency_id=sl.id,
            skill_name=sk.name,
            level_name=lv.name
        ))
        
    return RecommendationDetail(
        id=rec.id,
        description=rec.description,
        check_repo=rec.check_repo,
        is_published=rec.is_published,
        skills=skills_items
    )

@router.post("/recommendations", response_model=RecommendationDetail)
async def create_recommendation(
    data: RecommendationCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    rec = Recommendation(
        description=data.description,
        check_repo=data.check_repo,
        is_published=data.is_published,
        author_id=claims.user_id
    )
    db.add(rec)
    await db.flush()
    
    for prof_id in data.proficiency_ids:
        db.add(SkillRecommendation(
            proficiency_id=prof_id,
            recommendation_id=rec.id
        ))
        
    await db.commit()
    return await get_recommendation(rec.id, db, claims)

@router.put("/recommendations/{rec_id}", response_model=RecommendationDetail)
async def update_recommendation(
    rec_id: int,
    data: RecommendationCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(Recommendation).where(Recommendation.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()
    
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    rec.description = data.description
    rec.check_repo = data.check_repo
    rec.is_published = data.is_published
    
    # удаление старых навыков
    await db.execute(delete(SkillRecommendation).where(SkillRecommendation.recommendation_id == rec_id))
    
    # добавление новых навыков
    for prof_id in data.proficiency_ids:
        db.add(SkillRecommendation(
            proficiency_id=prof_id,
            recommendation_id=rec.id
        ))
        
    await db.commit()
    return await get_recommendation(rec.id, db, claims)

@router.delete("/recommendations/{rec_id}")
async def delete_recommendation(
    rec_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(Recommendation).where(Recommendation.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()
    
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    await db.delete(rec)
    await db.commit()
    return {"status": "ok"}
