from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case

from .schemas import TestSearchResponse, TestItem
from ..auth.utils import require_role
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Test, Proficiency, Skill, Level, TestAttempt

router = APIRouter(prefix="/tests", tags=["Tests"])

@router.get("", response_model=TestSearchResponse)
async def search_tests(
    search: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(
        Test.id,
        Skill.name.label("skill_name"),
        Level.name.label("level_name"),
        Test.variant,
        Test.is_published,
        func.count(TestAttempt.id).label("attempts_count"),
        func.sum(case((TestAttempt.score >= Test.threshold_score, 1), else_=0)).label("passed_count")
    ).outerjoin(Proficiency, Test.proficiency_id == Proficiency.id) \
     .outerjoin(Skill, Proficiency.skill_id == Skill.id) \
     .outerjoin(Level, Proficiency.level_id == Level.id) \
     .outerjoin(TestAttempt, TestAttempt.test_id == Test.id)

    if search:
        if " - " in search:
            parts = search.split(" - ")
            skill_part = parts[0].strip()
            level_part = " - ".join(parts[1:]).strip()
            query = query.where(and_(Skill.name.ilike(f"%{skill_part}%"), Level.name.ilike(f"%{level_part}%")))
        else:
            query = query.where(Skill.name.ilike(f"%{search}%"))

    query = query.group_by(Test.id, Skill.name, Level.name, Test.variant, Test.is_published)
    query = query.order_by(Test.id.desc())

    offset = (page - 1) * limit
    
    count_query = select(func.count()).select_from(Test)
    if search:
        count_query = count_query.outerjoin(Proficiency, Test.proficiency_id == Proficiency.id) \
                                 .outerjoin(Skill, Proficiency.skill_id == Skill.id) \
                                 .outerjoin(Level, Proficiency.level_id == Level.id)
        if " - " in search:
            parts = search.split(" - ")
            skill_part = parts[0].strip()
            level_part = " - ".join(parts[1:]).strip()
            count_query = count_query.where(and_(Skill.name.ilike(f"%{skill_part}%"), Level.name.ilike(f"%{level_part}%")))
        else:
            count_query = count_query.where(Skill.name.ilike(f"%{search}%"))

    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        items.append(TestItem(
            id=row.id,
            skill_name=row.skill_name or "Неизвестно",
            level_name=row.level_name or "Неизвестно",
            variant=row.variant,
            attempts_count=row.attempts_count or 0,
            passed_count=row.passed_count or 0,
            status="Опубликовано" if row.is_published else "Сохранено"
        ))

    return TestSearchResponse(
        items=items,
        total_pages=total_pages,
        current_page=page,
    )
