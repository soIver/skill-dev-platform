from datetime import datetime
from typing import Literal

from pydantic import BaseModel


ProgressActivityContentType = Literal["test", "task", "vacancy"]


class ProgressActivitySkillLevelItem(BaseModel):
    id: int
    skill_name: str
    level_name: str


class ProgressActivityItem(BaseModel):
    id: str
    content_type: ProgressActivityContentType
    target_id: int
    title: str
    action_text: str
    description: str | None = None
    occurred_at: datetime
    successful: bool | None = None
    skill_level: ProgressActivitySkillLevelItem | None = None


class ProgressActivityListResponse(BaseModel):
    items: list[ProgressActivityItem]
    total_pages: int
    current_page: int
