from pydantic import BaseModel
from typing import Optional

class TaskItem(BaseModel):
    id: int
    description_preview: str
    issued_count: int
    average_rating: str
    status: str

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
    description: Optional[str]
    is_published: bool
    skills: list[SkillTaskItem]

class TaskCreateUpdate(BaseModel):
    description: Optional[str]
    is_published: bool
    skill_level_ids: list[int]
