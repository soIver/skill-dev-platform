from pydantic import BaseModel, Field
from typing import List

class TestItem(BaseModel):
    id: int
    skill_name: str
    level_name: str
    variant_number: int
    attempts_count: int
    passed_count: int
    status: str

class TestSearchResponse(BaseModel):
    items: list[TestItem]
    total_pages: int
    current_page: int

class AnswerCreateUpdate(BaseModel):
    answer_text: str = Field(..., max_length=64)
    is_correct: bool

class QuestionCreateUpdate(BaseModel):
    question_text: str = Field(..., min_length=32, max_length=1024)
    points: int = Field(..., ge=1)
    answers: List[AnswerCreateUpdate]

class TestCreateUpdate(BaseModel):
    description: str = Field(..., min_length=64, max_length=2048)
    time_limit_minutes: int = Field(..., ge=3)
    threshold_score: int = Field(..., ge=1)
    is_published: bool
    skill_level_id: int
    questions: List[QuestionCreateUpdate]

class AnswerDetail(BaseModel):
    id: int
    answer_text: str
    is_correct: bool

class QuestionDetail(BaseModel):
    id: int
    question_text: str
    points: int
    answers: List[AnswerDetail]

class TestDetail(BaseModel):
    id: int
    skill_level_id: int
    skill_name: str
    level_name: str
    description: str
    time_limit_minutes: int
    threshold_score: int
    is_published: bool
    variant_number: int
    questions: List[QuestionDetail]

class TestPublicLevelItem(BaseModel):
    id: int
    test_id: int
    skill_level_id: int
    level_name: str
    description_preview: str
    question_count: int
    total_score: int
    threshold_score: int
    time_limit_minutes: int

class TestPublicItem(BaseModel):
    id: int
    skill_id: int
    skill_name: str
    levels: list[TestPublicLevelItem]

class TestPublicSearchResponse(BaseModel):
    items: list[TestPublicItem]
    total_pages: int
    current_page: int
