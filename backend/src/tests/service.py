import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    TestAttemptAnswerItem,
    TestAttemptQuestionItem,
    TestAttemptResult,
    TestAttemptStartResponse,
    TestAttemptState,
)
from ..config import global_config
from ..models import Level, QuestionAnswer, Skill, SkillLevel, Test, TestAttempt, TestGroup, TestQuestion
from ..utils.redis import get_redis

ATTEMPT_KEY_PREFIX = "test_attempt"
ATTEMPT_GRACE_SECONDS = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_key(attempt_id: str) -> str:
    return f"{ATTEMPT_KEY_PREFIX}:{attempt_id}"


def _parse_dt(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _remaining_seconds(state: dict) -> int:
    return max(0, int((_parse_dt(state["expires_at"]) - _now()).total_seconds()))


async def _load_state(attempt_id: str) -> dict | None:
    redis = get_redis()
    raw_state = await redis.get(_attempt_key(attempt_id))
    if not raw_state:
        return None
    return json.loads(raw_state)


async def _save_state(attempt_id: str, state: dict):
    redis = get_redis()
    ttl = max(ATTEMPT_GRACE_SECONDS, _remaining_seconds(state) + ATTEMPT_GRACE_SECONDS)
    await redis.set(_attempt_key(attempt_id), json.dumps(state), ex=ttl)


async def _delete_state(attempt_id: str):
    redis = get_redis()
    await redis.delete(_attempt_key(attempt_id))


async def _get_question_state(db: AsyncSession, attempt_id: str, state: dict) -> TestAttemptState:
    question_ids = state["question_ids"]
    answered_ids = set(state.get("answers", {}).keys())
    current_index = 0
    for index, question_id in enumerate(question_ids):
        if str(question_id) not in answered_ids:
            current_index = index
            break

    question_id = question_ids[current_index]
    question_result = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.id == question_id)
    )
    question = question_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Вопрос не найден")

    answers_result = await db.execute(
        select(QuestionAnswer)
        .where(QuestionAnswer.question_id == question_id)
        .order_by(QuestionAnswer.order_index, QuestionAnswer.id)
    )
    answers = answers_result.scalars().all()
    correct_count = sum(1 for answer in answers if answer.is_correct)

    return TestAttemptState(
        attempt_id=attempt_id,
        skill_level_id=state["skill_level_id"],
        skill_name=state["skill_name"],
        level_name=state["level_name"],
        question=TestAttemptQuestionItem(
            id=question.id,
            question_text=question.question_text,
            answers=[
                TestAttemptAnswerItem(id=answer.id, answer_text=answer.answer_text)
                for answer in answers
            ],
            multiple=correct_count > 1,
        ),
        question_number=current_index + 1,
        question_count=len(question_ids),
        remaining_seconds=_remaining_seconds(state),
        total_score=state["total_score"],
        threshold_score=state["threshold_score"],
    )


async def get_latest_attempts_by_skill_level(db: AsyncSession, user_id: int, skill_level_ids: list[int]) -> dict[int, dict]:
    if not skill_level_ids:
        return {}

    total_score_sq = (
        select(func.coalesce(func.sum(TestQuestion.points), 0))
        .where(TestQuestion.test_id == Test.id)
        .scalar_subquery()
    )
    attempts_query = (
        select(
            TestGroup.skill_level_id,
            TestAttempt.score,
            TestAttempt.completed_at,
            Test.threshold_score,
            total_score_sq.label("total_score"),
        )
        .select_from(TestAttempt)
        .join(Test, TestAttempt.test_id == Test.id)
        .join(TestGroup, Test.test_group_id == TestGroup.id)
        .where(
            TestAttempt.user_id == user_id,
            TestAttempt.completed_at.isnot(None),
            TestGroup.skill_level_id.in_(skill_level_ids),
        )
        .order_by(TestGroup.skill_level_id, TestAttempt.completed_at.desc())
    )
    attempts_result = await db.execute(attempts_query)

    latest_attempts = {}
    for row in attempts_result.all():
        if row.skill_level_id in latest_attempts:
            continue
        next_attempt_at = row.completed_at + timedelta(days=global_config.DAYS_FOR_TEST_ATTEMPT)
        latest_attempts[row.skill_level_id] = {
            "score": row.score or 0,
            "total_score": row.total_score or 0,
            "threshold_score": row.threshold_score or 0,
            "completed_at": row.completed_at,
            "passed": (row.score or 0) >= (row.threshold_score or 0),
            "next_attempt_at": next_attempt_at,
            "can_start_attempt": next_attempt_at <= _now(),
        }

    return latest_attempts


async def start_attempt(db: AsyncSession, user_id: int, skill_level_id: int) -> TestAttemptStartResponse:
    latest_attempt = await _get_latest_skill_level_attempt(db, user_id, skill_level_id)
    if latest_attempt:
        next_attempt_at = latest_attempt.completed_at + timedelta(days=global_config.DAYS_FOR_TEST_ATTEMPT)
        if next_attempt_at > _now():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Следующая попытка пока недоступна",
            )

    test = await _select_test_variant(db, user_id, skill_level_id)
    skill_level_row = await _get_skill_level_name(db, skill_level_id)
    questions_result = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test.id)
        .order_by(TestQuestion.order_index, TestQuestion.id)
    )
    questions = questions_result.scalars().all()
    if not questions:
        raise HTTPException(status_code=400, detail="В тесте нет вопросов")

    total_score = sum(question.points or 0 for question in questions)
    attempt_id = secrets.token_urlsafe(32)
    now = _now()
    time_limit_seconds = (test.time_limit_minutes or 0) * 60
    state = {
        "user_id": user_id,
        "test_id": test.id,
        "skill_level_id": skill_level_id,
        "skill_name": skill_level_row["skill_name"],
        "level_name": skill_level_row["level_name"],
        "question_ids": [question.id for question in questions],
        "answers": {},
        "started_at": _format_dt(now),
        "expires_at": _format_dt(now + timedelta(seconds=time_limit_seconds)),
        "total_score": total_score,
        "threshold_score": test.threshold_score or 0,
    }
    await _save_state(attempt_id, state)
    return TestAttemptStartResponse(**(await _get_question_state(db, attempt_id, state)).model_dump())


async def get_attempt_state(db: AsyncSession, attempt_id: str, user_id: int) -> TestAttemptState:
    state = await _require_state(attempt_id, user_id)
    if _remaining_seconds(state) <= 0:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Время попытки истекло")
    return await _get_question_state(db, attempt_id, state)


async def heartbeat_attempt(attempt_id: str, user_id: int):
    state = await _require_state(attempt_id, user_id)
    await _save_state(attempt_id, state)


async def submit_answer(db: AsyncSession, attempt_id: str, user_id: int, question_id: int, answer_ids: list[int]):
    state = await _require_state(attempt_id, user_id)
    if _remaining_seconds(state) <= 0:
        result = await finish_attempt(db, attempt_id, user_id, cheated=False)
        return None, result

    question_ids = state["question_ids"]
    answers = state.setdefault("answers", {})
    unanswered_ids = [qid for qid in question_ids if str(qid) not in answers]
    if not unanswered_ids or question_id != unanswered_ids[0]:
        raise HTTPException(status_code=400, detail="Нельзя ответить на этот вопрос")

    question_result = await db.execute(
        select(TestQuestion)
        .where(
            TestQuestion.id == question_id,
            TestQuestion.test_id == state["test_id"],
        )
    )
    question = question_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Вопрос не найден")

    answers_result = await db.execute(
        select(QuestionAnswer)
        .where(QuestionAnswer.question_id == question_id)
    )
    question_answers = answers_result.scalars().all()
    valid_answer_ids = {answer.id for answer in question_answers}
    selected_answer_ids = set(answer_ids)
    if not selected_answer_ids.issubset(valid_answer_ids):
        raise HTTPException(status_code=400, detail="Некорректный вариант ответа")

    correct_answer_ids = {answer.id for answer in question_answers if answer.is_correct}
    answers[str(question_id)] = question.points if selected_answer_ids == correct_answer_ids else 0
    await _save_state(attempt_id, state)

    if len(answers) >= len(question_ids):
        result = await finish_attempt(db, attempt_id, user_id, cheated=False)
        return None, result

    return await _get_question_state(db, attempt_id, state), None


async def finish_attempt(db: AsyncSession, attempt_id: str, user_id: int, cheated: bool = False) -> TestAttemptResult:
    state = await _require_state(attempt_id, user_id)
    result = await _complete_attempt(db, attempt_id, state, cheated)
    await _delete_state(attempt_id)
    return result


async def finish_attempt_without_user(db: AsyncSession, attempt_id: str):
    state = await _load_state(attempt_id)
    if not state:
        return
    await _complete_attempt(db, attempt_id, state, cheated=False)
    await _delete_state(attempt_id)


async def _complete_attempt(db: AsyncSession, attempt_id: str, state: dict, cheated: bool) -> TestAttemptResult:
    score = 0 if cheated else sum(int(value) for value in state.get("answers", {}).values())
    completed_at = _now()

    attempt_result = await db.execute(
        select(TestAttempt)
        .where(
            TestAttempt.user_id == state["user_id"],
            TestAttempt.test_id == state["test_id"],
        )
        .order_by(nulls_last(TestAttempt.completed_at.desc()), TestAttempt.id.desc())
        .limit(1)
    )
    attempt = attempt_result.scalar_one_or_none()
    if attempt:
        attempt.score = score
        attempt.completed_at = completed_at
    else:
        db.add(TestAttempt(
            user_id=state["user_id"],
            test_id=state["test_id"],
            score=score,
            completed_at=completed_at,
        ))

    await db.commit()
    return TestAttemptResult(
        score=score,
        total_score=state["total_score"],
        threshold_score=state["threshold_score"],
        passed=score >= state["threshold_score"],
        completed_at=completed_at,
        cheated=cheated,
    )


async def _require_state(attempt_id: str, user_id: int) -> dict:
    state = await _load_state(attempt_id)
    if not state:
        raise HTTPException(status_code=404, detail="Попытка не найдена")
    if state["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return state


async def _get_latest_skill_level_attempt(db: AsyncSession, user_id: int, skill_level_id: int) -> TestAttempt | None:
    latest_attempt_result = await db.execute(
        select(TestAttempt)
        .join(Test, TestAttempt.test_id == Test.id)
        .join(TestGroup, Test.test_group_id == TestGroup.id)
        .where(
            TestAttempt.user_id == user_id,
            TestGroup.skill_level_id == skill_level_id,
            TestAttempt.completed_at.isnot(None),
        )
        .order_by(TestAttempt.completed_at.desc())
        .limit(1)
    )
    return latest_attempt_result.scalar_one_or_none()


async def _select_test_variant(db: AsyncSession, user_id: int, skill_level_id: int) -> Test:
    tests_result = await db.execute(
        select(Test)
        .join(TestGroup, Test.test_group_id == TestGroup.id)
        .where(
            TestGroup.skill_level_id == skill_level_id,
            Test.is_published == True,
        )
        .order_by(Test.id)
    )
    tests = tests_result.scalars().all()
    if not tests:
        raise HTTPException(status_code=404, detail="Опубликованные варианты теста не найдены")

    test_ids = [test.id for test in tests]
    attempts_result = await db.execute(
        select(TestAttempt.test_id, func.max(TestAttempt.completed_at).label("completed_at"))
        .where(
            TestAttempt.user_id == user_id,
            TestAttempt.test_id.in_(test_ids),
            TestAttempt.completed_at.isnot(None),
        )
        .group_by(TestAttempt.test_id)
    )
    attempts_by_test_id = {row.test_id: row.completed_at for row in attempts_result.all()}
    for test in tests:
        if test.id not in attempts_by_test_id:
            return test

    oldest_test = min(tests, key=lambda item: attempts_by_test_id[item.id])
    return oldest_test


async def _get_skill_level_name(db: AsyncSession, skill_level_id: int) -> dict:
    skill_level_result = await db.execute(
        select(Skill.name.label("skill_name"), Level.name.label("level_name"))
        .select_from(SkillLevel)
        .join(Skill, SkillLevel.skill_id == Skill.id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(SkillLevel.id == skill_level_id)
    )
    row = skill_level_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Уровень навыка не найден")
    return {
        "skill_name": row.skill_name or "Неизвестно",
        "level_name": row.level_name or "Неизвестно",
    }
