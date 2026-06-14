from datetime import datetime
from typing import Literal

from pydantic import BaseModel


RecommendationContentType = Literal["task", "test"]


class RecommendationSkillLevelItem(BaseModel):
    id: int
    skill_name: str
    level_name: str


class RecommendationPsFunctionItem(BaseModel):
    id: int
    code: int
    name: str


class RecommendationItem(BaseModel):
    id: str
    content_type: RecommendationContentType
    target_id: int
    score: float
    created_at: datetime
    expires_at: datetime
    title: str
    description: str | None = None
    skill_levels: list[RecommendationSkillLevelItem] = []
    ps_functions: list[RecommendationPsFunctionItem] = []


class RecommendationListResponse(BaseModel):
    items: list[RecommendationItem]
    skip_limit: int
    skips_used: int
    skips_available: int


class RecommendationSkipResponse(BaseModel):
    skipped: bool
    skips_used: int
    skips_available: int
