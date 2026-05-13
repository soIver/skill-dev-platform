from pydantic import BaseModel, Field
from typing import Optional


class SkillLevelCreateRequest(BaseModel):
    skill_name: str = Field(..., min_length=1)
    level_name: str = Field(..., min_length=1)


class SkillLevelItem(BaseModel):
    id: int
    skill_name: str
    level_name: str
    obtained_count: int


class SkillLevelSearchResponse(BaseModel):
    items: list[SkillLevelItem]
    total_pages: int
    current_page: int


# поиск навыков (без уровней) для связей
class SkillSearchItem(BaseModel):
    id: int
    name: str


class SkillSearchResponse(BaseModel):
    items: list[SkillSearchItem]


# связи навыков
class SkillRelationItem(BaseModel):
    id: int
    source_id: int
    source_name: str
    influence_weight: float


class SkillRelationCreate(BaseModel):
    source_id: int
    influence_weight: float = Field(ge=0.1, le=1.0)


# уровень в редакторе
class LevelItem(BaseModel):
    id: int
    level_name: str
    order_index: int


# детали для редактора
class SkillLevelDetail(BaseModel):
    id: int
    skill_id: int
    skill_name: str
    levels: list[LevelItem]
    relations: list[SkillRelationItem]


# обновление
class SkillLevelUpdateRequest(BaseModel):
    level_order: list[int]
    relations: list[SkillRelationCreate]


# навыки пользователя
class UserSkillItem(BaseModel):
    id: int
    skill_name: str
    level_name: str
    confidence: float


class UserSkillResponse(BaseModel):
    items: list[UserSkillItem]
    total_pages: int
    current_page: int
