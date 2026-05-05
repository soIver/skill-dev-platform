from pydantic import BaseModel, Field

class ProficiencyCreateRequest(BaseModel):
    skill_name: str = Field(..., min_length=1)
    level_name: str = Field(..., min_length=1)

class ProficiencyItem(BaseModel):
    id: int
    skill_name: str
    level_name: str
    obtained_count: int

class ProficiencySearchResponse(BaseModel):
    items: list[ProficiencyItem]
    total_pages: int
    current_page: int
