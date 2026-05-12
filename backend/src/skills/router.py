from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from .schemas import (
    ProficiencyCreateRequest, ProficiencySearchResponse, ProficiencyItem,
    UserProficiencyResponse, UserProficiencyItem
)
from .utils import calculate_adjusted_score, calculate_confidence
from ..auth.utils import require_role, get_current_user
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Skill, Level, Proficiency, UserProficiency, RepoSkill, UserRepo, TestAttempt, Test
from ..analysis.utils import get_embedding
from ..config import global_config
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/skills", tags=["Skills"])

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
        embedding = await get_embedding(req.skill_name)
        skill_obj = Skill(name=req.skill_name, embedding=embedding)
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

@router.get("/me", response_model=UserProficiencyResponse)
async def get_my_proficiencies(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenClaims = Depends(get_current_user),
):
    # Fetch user proficiencies
    query = select(UserProficiency).where(UserProficiency.user_id == user.user_id)
    
    # Count total
    count_query = select(func.count()).select_from(UserProficiency).where(UserProficiency.user_id == user.user_id)
    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1
    
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    user_profs = result.scalars().all()
    
    items = []
    for up in user_profs:
        # Get skill and current level
        prof_result = await db.execute(
            select(Proficiency, Skill, Level)
            .join(Skill, Proficiency.skill_id == Skill.id)
            .join(Level, Proficiency.level_id == Level.id)
            .where(Proficiency.id == up.proficiency_id)
        )
        prof_data = prof_result.first()
        if not prof_data:
            continue
            
        current_prof, skill, level = prof_data
        
        # Get total levels for this skill
        total_levels = await db.scalar(
            select(func.count(Proficiency.id)).where(Proficiency.skill_id == skill.id)
        )
        
        # Get next level order index
        next_level_order = current_prof.order_index + 1
        
        # Fetch last 5 repo skills
        repo_skills_result = await db.execute(
            select(RepoSkill, UserRepo.analyzed_at)
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user.user_id, RepoSkill.skill_id == skill.id)
            .order_by(UserRepo.analyzed_at.desc())
            .limit(5)
        )
        repo_skills_data = repo_skills_result.all()
        
        adjusted_scores = []
        for rs, analyzed_at in repo_skills_data:
            adj = calculate_adjusted_score(rs.score, analyzed_at)
            adjusted_scores.append(adj)
            
        confidence = calculate_confidence(adjusted_scores, total_levels, next_level_order)

        # 2. Штраф/бонус за количество встреч навыка
        n_query = select(func.count(RepoSkill.id)).join(UserRepo).where(
            UserRepo.user_id == user.user_id,
            RepoSkill.skill_id == skill.id
        )
        n = await db.scalar(n_query)
        a = (global_config.REPO_SKILL_COUNT_FOR_UPDATE / 2) - (n or 0)
        if a > 0:
            confidence = confidence * (1 - 0.1 * a)

        # 3. Множитель на основе попыток прохождения тестов
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=global_config.DAYS_FOR_TEST_ATTEMPT * 2)
        test_attempt_query = select(TestAttempt, Test).join(Test, TestAttempt.test_id == Test.id).where(
            TestAttempt.user_id == user.user_id,
            Test.proficiency_id == current_prof.id,
            TestAttempt.completed_at >= cutoff_date
        ).order_by(TestAttempt.completed_at.desc()).limit(1)
        
        test_attempt_res = await db.execute(test_attempt_query)
        test_attempt_data = test_attempt_res.first()

        if test_attempt_data:
            ta, test = test_attempt_data
            m = ta.score / test.threshold_score if test.threshold_score else 1.0
            confidence = confidence * m
        else:
            confidence = confidence * 0.7

        # 4. Ограничение уверенности до 1.0
        confidence = min(1.0, max(0.0, confidence))
        
        items.append(UserProficiencyItem(
            id=up.id,
            skill_name=skill.name,
            level_name=level.name,
            confidence=round(confidence, 2)
        ))
        
    return UserProficiencyResponse(
        items=items,
        total_pages=total_pages,
        current_page=page
    )
