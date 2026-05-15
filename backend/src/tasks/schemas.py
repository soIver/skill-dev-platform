from pydantic import BaseModel, Field
from typing import Optional

class TaskItem(BaseModel):
    id: int
    title: str
    description_preview: str
    issued_count: int
    average_rating: str
    status: str
    skills: list[SkillTaskItem]

class TaskSearchResponse(BaseModel):
    items: list[TaskItem]
    total_pages: int
    current_page: int

class SkillTaskItem(BaseModel):
    skill_level_id: int
    skill_name: str
    level_name: str

class TaskDetail(BaseModel):
    id: int
    title: str
    description: str
    is_published: bool
    skills: list[SkillTaskItem]

class TaskCreateUpdate(BaseModel):
    title: str = Field(..., min_length=4, max_length=48)
    description: str = Field(..., min_length=64, max_length=2048)
    is_published: bool
    skill_level_ids: list[int]

class TaskPublicItem(BaseModel):
    id: int
    title: str
    description_preview: str
    skills: list[SkillTaskItem]

class TaskPublicSearchResponse(BaseModel):
    items: list[TaskPublicItem]
    total_pages: int
    current_page: int
