import pytest
from pydantic import ValidationError

from src.tests.schemas import AnswerCreateUpdate, QuestionCreateUpdate
from src.tests.schemas import TestAttemptAnswerRequest as AttemptAnswerRequestSchema
from src.tests.schemas import TestCreateUpdate as CreateUpdateSchema


def test_test_create_update_enforces_question_contract():
    question = QuestionCreateUpdate(
        question_text="Какой инструмент используется для backend-тестов проекта?",
        points=2,
        answers=[
            AnswerCreateUpdate(answer_text="Pytest", is_correct=True),
            AnswerCreateUpdate(answer_text="Webpack", is_correct=False),
        ],
    )
    payload = CreateUpdateSchema(
        description="Описание теста достаточно длинное для проверки схемы. " * 2,
        time_limit_minutes=3,
        threshold_score=1,
        is_published=True,
        skill_level_id=1,
        questions=[question] * 10,
    )

    assert payload.questions[0].points == 2


def test_attempt_answer_request_requires_answers():
    with pytest.raises(ValidationError):
        AttemptAnswerRequestSchema(question_id=1, answer_ids=[])
