from pydantic import BaseModel
from typing import Optional

class RecommendationItem(BaseModel):
    id: int
    description_preview: str
    issued_count: int
    average_rating: str
    status: str

class RecommendationSearchResponse(BaseModel):
    items: list[RecommendationItem]
    total_pages: int
    current_page: int

class SkillRecommendationItem(BaseModel):
    proficiency_id: int
    skill_name: str
    level_name: str

class RecommendationDetail(BaseModel):
    id: int
    description: Optional[str]
    check_repo: bool
    is_published: bool
    skills: list[SkillRecommendationItem]

class RecommendationCreateUpdate(BaseModel):
    description: Optional[str]
    check_repo: bool
    is_published: bool
    proficiency_ids: list[int]
