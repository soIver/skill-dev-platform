from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    SkillLevelCreateRequest, SkillLevelSearchResponse, SkillLevelItem,
    SkillSearchResponse, LevelSearchResponse,
    SkillLevelDetail,
    SkillLevelUpdateRequest,
    UserSkillResponse,
)
from .service import SkillService
from ..auth.utils import require_role, get_current_user
from ..auth.service import TokenClaims
from ..utils.database import get_db

router = APIRouter(prefix="/skills", tags=["Skills"])


@router.get("/search", response_model=SkillSearchResponse)
async def search_skills(name: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    """поиск навыков (без уровней) по названию"""
    return await SkillService(db).search_skills(name)


@router.get("/levels/search", response_model=LevelSearchResponse)
async def search_levels(name: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    """поиск уровней по названию"""
    return await SkillService(db).search_levels(name)


@router.get("/skill_levels", response_model=SkillLevelSearchResponse)
async def search_skill_levels(
    skill: str = Query(None),
    level: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    """поиск компетенций (навык + уровень) с подсчётом obtained_count"""
    return await SkillService(db).search_skill_levels(skill, level, page, limit)


@router.post("/skill_levels", response_model=SkillLevelItem)
async def create_skill_level(req: SkillLevelCreateRequest, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    """создание компетенции"""
    return await SkillService(db).create_skill_level(req, claims.user_id)


@router.get("/skill_levels/{sl_id}", response_model=SkillLevelDetail)
async def get_skill_level(sl_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    """загрузка данных компетенции для редактора"""
    return await SkillService(db).get_skill_level(sl_id)


@router.put("/skill_levels/{sl_id}", response_model=SkillLevelDetail)
async def update_skill_level(
    sl_id: int,
    data: SkillLevelUpdateRequest,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    """сохранение порядка уровней и связей"""
    return await SkillService(db).update_skill_level(sl_id, data)


@router.delete("/skill_levels/{sl_id}")
async def delete_skill_level(sl_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    """удаление компетенции"""
    await SkillService(db).delete_skill_level(sl_id)
    return {"status": "ok"}


@router.get("/me", response_model=UserSkillResponse)
async def get_my_skills(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenClaims = Depends(get_current_user),
):
    """список навыков текущего пользователя"""
    return await SkillService(db).get_my_skills(user.user_id, page, limit)
