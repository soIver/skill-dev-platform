from datetime import datetime

from pydantic import BaseModel, Field
from typing import Optional

class SkillTaskItem(BaseModel):
    skill_level_id: int
    skill_name: str
    level_name: str

class PsFunctionItem(BaseModel):
    id: int
    code: int
    name: str

class TaskRequirementItem(BaseModel):
    id: int
    description: str

class TaskRequirementCreateUpdate(BaseModel):
    id: int | None = None
    description: str = Field(..., min_length=16, max_length=64)

class TaskFailedRequirementItem(BaseModel):
    id: int | None = None
    description: str

class TaskLatestAttemptItem(BaseModel):
    repo_name: str
    repo_url: str | None = None
    completed_at: datetime | None = None
    successful: bool
    failed_requirements: list[TaskFailedRequirementItem] = []

class TaskItem(BaseModel):
    id: int
    title: str
    description_preview: str
    issued_count: int
    completed_count: int
    status: str
    skills: list[SkillTaskItem]
    ps_functions: list[PsFunctionItem] = []
    attached_repo_name: Optional[str] = None
    latest_attempt: TaskLatestAttemptItem | None = None

class TaskSearchResponse(BaseModel):
    items: list[TaskItem]
    total_pages: int
    current_page: int


class TaskDetail(BaseModel):
    id: int
    title: str
    description: str
    is_published: bool
    skills: list[SkillTaskItem]
    requirements: list[TaskRequirementItem]
    ps_functions: list[PsFunctionItem] = []
    attached_repo_name: Optional[str] = None
    latest_attempt: TaskLatestAttemptItem | None = None

class TaskCreateUpdate(BaseModel):
    title: str = Field(..., min_length=4, max_length=48)
    description: str = Field(..., min_length=64, max_length=2048)
    is_published: bool
    skill_level_ids: list[int]
    requirements: list[TaskRequirementCreateUpdate] = Field(..., min_length=2, max_length=10)
    ps_function_ids: list[int] = []

class TaskPublicItem(BaseModel):
    id: int
    title: str
    description_preview: str
    skills: list[SkillTaskItem]
    ps_functions: list[PsFunctionItem] = []
    attached_repo_name: Optional[str] = None
    latest_attempt: TaskLatestAttemptItem | None = None

class TaskPublicSearchResponse(BaseModel):
    items: list[TaskPublicItem]
    total_pages: int
    current_page: int
