from pydantic import BaseModel

class TestItem(BaseModel):
    id: int
    skill_name: str
    level_name: str
    attempts_count: int
    passed_count: int
    status: str

class TestSearchResponse(BaseModel):
    items: list[TestItem]
    total_pages: int
    current_page: int
