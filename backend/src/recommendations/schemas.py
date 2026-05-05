from pydantic import BaseModel
from typing import Optional

class RecommendationItem(BaseModel):
    id: int
    description_preview: str
    issued_count: int
    average_rating: str  # using string to easily format with '-' if None
    status: str

class RecommendationSearchResponse(BaseModel):
    items: list[RecommendationItem]
    total_pages: int
    current_page: int
