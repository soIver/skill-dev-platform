from datetime import datetime

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

class PsFunctionItem(BaseModel):
    id: int
    code: int
    name: str

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
    ps_function_ids: list[int] = Field(default_factory=list, max_length=10)
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
    ps_functions: list[PsFunctionItem] = []
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
    ps_functions: list[PsFunctionItem] = []
    latest_attempt_score: int | None = None
    latest_attempt_total_score: int | None = None
    latest_attempt_threshold_score: int | None = None
    latest_attempt_completed_at: datetime | None = None
    latest_attempt_passed: bool | None = None
    next_attempt_at: datetime | None = None
    can_start_attempt: bool = True

class TestPublicItem(BaseModel):
    id: int
    skill_id: int
    skill_name: str
    levels: list[TestPublicLevelItem]

class TestPublicSearchResponse(BaseModel):
    items: list[TestPublicItem]
    total_pages: int
    current_page: int

class TestAttemptAnswerItem(BaseModel):
    id: int
    answer_text: str

class TestAttemptQuestionItem(BaseModel):
    id: int
    question_text: str
    answers: list[TestAttemptAnswerItem]
    multiple: bool

class TestAttemptState(BaseModel):
    attempt_id: str
    skill_level_id: int
    skill_name: str
    level_name: str
    question: TestAttemptQuestionItem
    question_number: int
    question_count: int
    remaining_seconds: int
    total_score: int
    threshold_score: int

class TestAttemptStartResponse(TestAttemptState):
    pass

class TestAttemptAnswerRequest(BaseModel):
    question_id: int
    answer_ids: list[int] = Field(..., min_length=1)

class TestAttemptResult(BaseModel):
    score: int
    total_score: int
    threshold_score: int
    passed: bool
    completed_at: datetime
    cheated: bool = False

class TestAttemptAnswerResponse(BaseModel):
    completed: bool
    next_state: TestAttemptState | None = None
    result: TestAttemptResult | None = None

class TestAttemptFinishRequest(BaseModel):
    reason: str = "manual"
    cheated: bool = False
