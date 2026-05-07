from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from ..auth.utils import require_role
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Skill, Level, Proficiency, UserProficiency
from .schemas import ProficiencyCreateRequest, ProficiencySearchResponse, ProficiencyItem

router = APIRouter(tags=["Skills"])

@router.get("/proficiencies", response_model=ProficiencySearchResponse)
async def search_proficiencies(
    skill: str = Query(None),
    level: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(
        Proficiency.id,
        Skill.name.label("skill_name"),
        Level.name.label("level_name"),
        func.count(UserProficiency.id).label("obtained_count")
    ).join(Skill, Proficiency.skill_id == Skill.id) \
     .join(Level, Proficiency.level_id == Level.id) \
     .outerjoin(UserProficiency, UserProficiency.proficiency_id == Proficiency.id)
     
    if skill:
        query = query.where(Skill.name.ilike(f"%{skill}%"))
    if level:
        query = query.where(Level.name.ilike(f"%{level}%"))

    query = query.group_by(Proficiency.id, Skill.name, Level.name)
    query = query.order_by(func.count(UserProficiency.id).desc(), Skill.name, Level.name)

    offset = (page - 1) * limit
    
    count_query = select(func.count()).select_from(
        select(Proficiency.id)
        .join(Skill, Proficiency.skill_id == Skill.id)
        .join(Level, Proficiency.level_id == Level.id)
    )
    if skill:
        count_query = count_query.where(Skill.name.ilike(f"%{skill}%"))
    if level:
        count_query = count_query.where(Level.name.ilike(f"%{level}%"))
        
    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = [
        ProficiencyItem(
            id=row.id,
            skill_name=row.skill_name,
            level_name=row.level_name,
            obtained_count=row.obtained_count
        )
        for row in rows
    ]

    return ProficiencySearchResponse(
        items=items,
        total_pages=total_pages,
        current_page=page,
    )

@router.post("/proficiencies", response_model=ProficiencyItem)
async def create_proficiency(
    req: ProficiencyCreateRequest,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    skill_result = await db.execute(select(Skill).where(Skill.name.ilike(req.skill_name)))
    skill_obj = skill_result.scalar_one_or_none()
    
    if not skill_obj:
        skill_obj = Skill(name=req.skill_name)
        db.add(skill_obj)
        await db.flush()
        
    level_result = await db.execute(select(Level).where(Level.name.ilike(req.level_name)))
    level_obj = level_result.scalar_one_or_none()
    
    if not level_obj:
        level_obj = Level(name=req.level_name)
        db.add(level_obj)
        await db.flush()
        
    prof_result = await db.execute(
        select(Proficiency).where(
            and_(Proficiency.skill_id == skill_obj.id, Proficiency.level_id == level_obj.id)
        )
    )
    prof_obj = prof_result.scalar_one_or_none()
    
    if prof_obj:
        obtained_count = await db.scalar(select(func.count(UserProficiency.id)).where(UserProficiency.proficiency_id == prof_obj.id))
        return ProficiencyItem(
            id=prof_obj.id,
            skill_name=skill_obj.name,
            level_name=level_obj.name,
            obtained_count=obtained_count or 0
        )
        
    max_idx_result = await db.execute(
        select(func.max(Proficiency.order_index)).where(Proficiency.skill_id == skill_obj.id)
    )
    max_idx = max_idx_result.scalar()
    new_order_index = (max_idx + 1) if max_idx is not None else 1
    
    new_prof = Proficiency(
        skill_id=skill_obj.id,
        level_id=level_obj.id,
        order_index=new_order_index,
        author_id=claims.user_id
    )
    db.add(new_prof)
    await db.commit()
    await db.refresh(new_prof)
    
    return ProficiencyItem(
        id=new_prof.id,
        skill_name=skill_obj.name,
        level_name=level_obj.name,
        obtained_count=0
    )
