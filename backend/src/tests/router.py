import asyncio

from fastapi import APIRouter, Depends, Query, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case, delete, or_
from sqlalchemy.orm import aliased

from .schemas import (
    TestSearchResponse, TestItem, TestDetail, TestCreateUpdate,
    QuestionDetail, AnswerDetail, TestPublicSearchResponse, TestPublicItem,
    TestPublicLevelItem, TestAttemptStartResponse, TestAttemptState,
    TestAttemptAnswerRequest, TestAttemptAnswerResponse, TestAttemptFinishRequest,
    TestAttemptResult
)
from .service import (
    finish_attempt,
    finish_attempt_without_user,
    get_attempt_state,
    get_latest_attempts_by_skill_level,
    heartbeat_attempt,
    start_attempt,
    submit_answer,
)
from ..auth.utils import require_role, resolve_author_filter
from ..auth.service import TokenClaims
from ..utils.database import AsyncSessionLocal, get_db
from ..models import Test, SkillLevel, Skill, Level, TestAttempt, TestQuestion, QuestionAnswer

router = APIRouter(prefix="/tests", tags=["Tests"])

@router.get("", response_model=TestSearchResponse)
async def search_tests(
    search: str = Query(None),
    keyword: str = Query(None),
    skill_query: str = Query(None),
    author_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    resolved_author_id = resolve_author_filter(claims, author_id)

    if search and not keyword and not skill_query:
        if " - " in search:
            skill_query = search
        else:
            keyword = search

    t_alias = aliased(Test)
    variant_subq = select(func.count(t_alias.id)).where(
        t_alias.skill_level_id == Test.skill_level_id,
        t_alias.id <= Test.id
    ).scalar_subquery()

    query = select(
        Test.id,
        Skill.name.label("skill_name"),
        Level.name.label("level_name"),
        Test.is_published,
        variant_subq.label("variant_number"),
        func.count(TestAttempt.id).label("attempts_count"),
        func.sum(case((TestAttempt.score >= Test.threshold_score, 1), else_=0)).label("passed_count")
    ).outerjoin(SkillLevel, Test.skill_level_id == SkillLevel.id) \
     .outerjoin(Skill, SkillLevel.skill_id == Skill.id) \
     .outerjoin(Level, SkillLevel.level_id == Level.id) \
     .outerjoin(TestAttempt, TestAttempt.test_id == Test.id)

    if resolved_author_id is not None:
        query = query.where(Test.author_id == resolved_author_id)

    if keyword:
        query = query.where(or_(Skill.name.ilike(f"%{keyword}%"), Test.description.ilike(f"%{keyword}%")))

    if skill_query:
        if " - " in skill_query:
            parts = skill_query.split(" - ")
            skill_part = parts[0].strip()
            level_part = " - ".join(parts[1:]).strip()
            query = query.where(and_(Skill.name.ilike(f"%{skill_part}%"), Level.name.ilike(f"%{level_part}%")))
        else:
            query = query.where(Skill.name.ilike(f"%{skill_query}%"))

    query = query.group_by(Test.id, Skill.name, Level.name, Test.is_published, Test.skill_level_id)
    query = query.order_by(Test.id.desc())

    offset = (page - 1) * limit

    count_query = select(func.count()).select_from(Test)
    if resolved_author_id is not None:
        count_query = count_query.where(Test.author_id == resolved_author_id)

    if keyword or skill_query:
        count_query = count_query.outerjoin(SkillLevel, Test.skill_level_id == SkillLevel.id) \
                                 .outerjoin(Skill, SkillLevel.skill_id == Skill.id) \
                                 .outerjoin(Level, SkillLevel.level_id == Level.id)

        if keyword:
            count_query = count_query.where(or_(Skill.name.ilike(f"%{keyword}%"), Test.description.ilike(f"%{keyword}%")))

        if skill_query:
            if " - " in skill_query:
                parts = skill_query.split(" - ")
                skill_part = parts[0].strip()
                level_part = " - ".join(parts[1:]).strip()
                count_query = count_query.where(and_(Skill.name.ilike(f"%{skill_part}%"), Level.name.ilike(f"%{level_part}%")))
            else:
                count_query = count_query.where(Skill.name.ilike(f"%{skill_query}%"))

    elif search:
        count_query = count_query.outerjoin(SkillLevel, Test.skill_level_id == SkillLevel.id) \
                                 .outerjoin(Skill, SkillLevel.skill_id == Skill.id) \
                                 .outerjoin(Level, SkillLevel.level_id == Level.id)
        if " - " in search:
            parts = search.split(" - ")
            skill_part = parts[0].strip()
            level_part = " - ".join(parts[1:]).strip()
            count_query = count_query.where(and_(Skill.name.ilike(f"%{skill_part}%"), Level.name.ilike(f"%{level_part}%")))
        else:
            count_query = count_query.where(or_(Skill.name.ilike(f"%{search}%"), Test.description.ilike(f"%{search}%")))

    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        items.append(TestItem(
            id=row.id,
            skill_name=row.skill_name or "Неизвестно",
            level_name=row.level_name or "Неизвестно",
            variant_number=row.variant_number or 1,
            attempts_count=row.attempts_count or 0,
            passed_count=row.passed_count or 0,
            status="Опубликовано" if row.is_published else "Сохранено"
        ))

    return TestSearchResponse(
        items=items,
        total_pages=total_pages,
        current_page=page,
    )

@router.get("/public", response_model=TestPublicSearchResponse)
async def search_public_tests(
    keyword: str = Query(None),
    skill_level_ids: list[int] = Query(default=[]),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    latest_published_tests = (
        select(Test.skill_level_id, func.max(Test.id).label("test_id"))
        .where(Test.is_published == True)
        .group_by(Test.skill_level_id)
        .subquery()
    )

    filters = []
    if keyword:
        trimmed_keyword = keyword.strip()
        if trimmed_keyword:
            filters.append(or_(
                Skill.name.ilike(f"%{trimmed_keyword}%"),
                Level.name.ilike(f"%{trimmed_keyword}%"),
                Test.description.ilike(f"%{trimmed_keyword}%"),
            ))
    if skill_level_ids:
        filters.append(SkillLevel.id.in_(skill_level_ids))

    matching_skill_ids = (
        select(Skill.id)
        .join(SkillLevel, SkillLevel.skill_id == Skill.id)
        .join(latest_published_tests, latest_published_tests.c.skill_level_id == SkillLevel.id)
        .join(Test, Test.id == latest_published_tests.c.test_id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(*filters)
        .group_by(Skill.id)
        .subquery()
    )

    total_count = await db.scalar(select(func.count()).select_from(matching_skill_ids))
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    skills_query = (
        select(Skill.id, Skill.name)
        .where(Skill.id.in_(select(matching_skill_ids.c.id)))
        .order_by(Skill.name)
        .offset((page - 1) * limit)
        .limit(limit)
    )
    skills_result = await db.execute(skills_query)
    skill_rows = skills_result.all()
    skill_ids = [row.id for row in skill_rows]

    if not skill_ids:
        return TestPublicSearchResponse(items=[], total_pages=total_pages, current_page=page)

    question_count_sq = (
        select(func.count(TestQuestion.id))
        .where(TestQuestion.test_id == Test.id)
        .scalar_subquery()
    )
    total_score_sq = (
        select(func.coalesce(func.sum(TestQuestion.points), 0))
        .where(TestQuestion.test_id == Test.id)
        .scalar_subquery()
    )

    levels_query = (
        select(
            Skill.id.label("skill_id"),
            Skill.name.label("skill_name"),
            SkillLevel.id.label("skill_level_id"),
            Level.name.label("level_name"),
            Test.id.label("test_id"),
            Test.description,
            Test.time_limit_minutes,
            Test.threshold_score,
            question_count_sq.label("question_count"),
            total_score_sq.label("total_score"),
        )
        .join(SkillLevel, SkillLevel.skill_id == Skill.id)
        .join(latest_published_tests, latest_published_tests.c.skill_level_id == SkillLevel.id)
        .join(Test, Test.id == latest_published_tests.c.test_id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(Skill.id.in_(skill_ids))
        .order_by(Skill.name, SkillLevel.order_index, Level.name)
    )
    levels_result = await db.execute(levels_query)
    level_rows = levels_result.all()
    latest_attempts = await get_latest_attempts_by_skill_level(
        db,
        claims.user_id,
        [row.skill_level_id for row in level_rows],
    )

    items_by_skill = {
        row.id: TestPublicItem(id=row.id, skill_id=row.id, skill_name=row.name, levels=[])
        for row in skill_rows
    }
    for row in level_rows:
        item = items_by_skill.get(row.skill_id)
        if not item:
            continue
        latest_attempt = latest_attempts.get(row.skill_level_id)
        item.levels.append(TestPublicLevelItem(
            id=row.skill_level_id,
            test_id=row.test_id,
            skill_level_id=row.skill_level_id,
            level_name=row.level_name or "Неизвестно",
            description_preview=row.description or "",
            question_count=row.question_count or 0,
            total_score=row.total_score or 0,
            threshold_score=row.threshold_score or 0,
            time_limit_minutes=row.time_limit_minutes or 0,
            latest_attempt_score=latest_attempt["score"] if latest_attempt else None,
            latest_attempt_total_score=latest_attempt["total_score"] if latest_attempt else None,
            latest_attempt_threshold_score=latest_attempt["threshold_score"] if latest_attempt else None,
            latest_attempt_completed_at=latest_attempt["completed_at"] if latest_attempt else None,
            latest_attempt_passed=latest_attempt["passed"] if latest_attempt else None,
            next_attempt_at=latest_attempt["next_attempt_at"] if latest_attempt else None,
            can_start_attempt=latest_attempt["can_start_attempt"] if latest_attempt else True,
        ))

    return TestPublicSearchResponse(
        items=[items_by_skill[row.id] for row in skill_rows],
        total_pages=total_pages,
        current_page=page,
    )

@router.post("/public/{skill_level_id}/start", response_model=TestAttemptStartResponse)
async def start_public_test_attempt(skill_level_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await start_attempt(db, claims.user_id, skill_level_id)

@router.get("/attempts/{attempt_id}", response_model=TestAttemptState)
async def get_public_test_attempt(attempt_id: str, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    return await get_attempt_state(db, attempt_id, claims.user_id)

@router.post("/attempts/{attempt_id}/heartbeat")
async def heartbeat_public_test_attempt(attempt_id: str, claims: TokenClaims = Depends(require_role("user", "curator", "admin"))):
    await heartbeat_attempt(attempt_id, claims.user_id)
    return {"status": "ok"}

@router.post("/attempts/{attempt_id}/answer", response_model=TestAttemptAnswerResponse)
async def answer_public_test_attempt(
    attempt_id: str,
    data: TestAttemptAnswerRequest,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    next_state, result = await submit_answer(
        db,
        attempt_id,
        claims.user_id,
        data.question_id,
        data.answer_ids,
    )
    return TestAttemptAnswerResponse(
        completed=result is not None,
        next_state=next_state,
        result=result,
    )

@router.post("/attempts/{attempt_id}/finish", response_model=TestAttemptResult)
async def finish_public_test_attempt(
    attempt_id: str,
    data: TestAttemptFinishRequest,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    return await finish_attempt(db, attempt_id, claims.user_id, cheated=data.cheated)

@router.websocket("/attempts/{attempt_id}/monitor")
async def monitor_public_test_attempt(websocket: WebSocket, attempt_id: str):
    await websocket.accept()
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=45)
            except asyncio.TimeoutError:
                continue
    except WebSocketDisconnect:
        await asyncio.sleep(2)
        async with AsyncSessionLocal() as db:
            await finish_attempt_without_user(db, attempt_id)

@router.get("/{test_id}", response_model=TestDetail)
async def get_test(test_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    query = select(Test).where(Test.id == test_id)
    result = await db.execute(query)
    test_obj = result.scalar_one_or_none()
    if not test_obj:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # получение навыка и уровня
    skill_level_q = select(Skill.name.label("skill_name"), Level.name.label("level_name")) \
        .select_from(SkillLevel) \
        .join(Skill, SkillLevel.skill_id == Skill.id) \
        .join(Level, SkillLevel.level_id == Level.id) \
        .where(SkillLevel.id == test_obj.skill_level_id)
    sl_res = await db.execute(skill_level_q)
    sl_row = sl_res.first()
    skill_name = sl_row.skill_name if sl_row else "Неизвестно"
    level_name = sl_row.level_name if sl_row else "Неизвестно"

    # вариант
    variant_q = select(func.count(Test.id)).where(
        Test.skill_level_id == test_obj.skill_level_id,
        Test.id <= test_obj.id
    )
    variant_number = await db.scalar(variant_q) or 1

    # вопросы
    questions_q = select(TestQuestion).where(TestQuestion.test_id == test_id).order_by(TestQuestion.order_index)
    q_res = await db.execute(questions_q)
    questions = q_res.scalars().all()

    # ответы
    q_ids = [q.id for q in questions]
    answers_map = {}
    if q_ids:
        answers_q = select(QuestionAnswer).where(QuestionAnswer.question_id.in_(q_ids)).order_by(QuestionAnswer.order_index)
        ans_res = await db.execute(answers_q)
        for ans in ans_res.scalars().all():
            answers_map.setdefault(ans.question_id, []).append(ans)

    questions_detail = []
    for q in questions:
        ans_list = answers_map.get(q.id, [])
        questions_detail.append(QuestionDetail(
            id=q.id,
            question_text=q.question_text,
            points=q.points,
            answers=[AnswerDetail(id=a.id, answer_text=a.answer_text, is_correct=a.is_correct) for a in ans_list]
        ))

    return TestDetail(
        id=test_obj.id,
        skill_level_id=test_obj.skill_level_id,
        skill_name=skill_name,
        level_name=level_name,
        description=test_obj.description or "",
        time_limit_minutes=test_obj.time_limit_minutes or 0,
        threshold_score=test_obj.threshold_score or 0,
        is_published=test_obj.is_published,
        variant_number=variant_number,
        questions=questions_detail
    )

@router.post("", response_model=TestDetail)
async def create_test(data: TestCreateUpdate, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    # валидация бизнес-логики
    if len(data.questions) < 10 or len(data.questions) > 50:
        raise HTTPException(status_code=400, detail="Количество вопросов должно быть от 10 до 50")

    total_points = sum(q.points for q in data.questions)
    if data.threshold_score > total_points:
        raise HTTPException(status_code=400, detail="Порог прохождения не может превышать сумму баллов за вопросы")

    new_test = Test(
        skill_level_id=data.skill_level_id,
        description=data.description,
        time_limit_minutes=data.time_limit_minutes,
        threshold_score=data.threshold_score,
        is_published=data.is_published,
        author_id=claims.user_id
    )
    db.add(new_test)
    await db.flush()

    for idx, q_data in enumerate(data.questions):
        new_q = TestQuestion(
            test_id=new_test.id,
            question_text=q_data.question_text,
            order_index=idx + 1,
            points=q_data.points
        )
        db.add(new_q)
        await db.flush()

        for a_idx, a_data in enumerate(q_data.answers):
            new_a = QuestionAnswer(
                question_id=new_q.id,
                answer_text=a_data.answer_text,
                is_correct=a_data.is_correct,
                order_index=a_idx + 1
            )
            db.add(new_a)

    await db.commit()
    return await get_test(new_test.id, db, claims)

@router.put("/{test_id}", response_model=TestDetail)
async def update_test(
    test_id: int,
    data: TestCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    query = select(Test).where(Test.id == test_id)
    result = await db.execute(query)
    test_obj = result.scalar_one_or_none()
    if not test_obj:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # валидация бизнес-логики
    if len(data.questions) < 10 or len(data.questions) > 50:
        raise HTTPException(status_code=400, detail="Количество вопросов должно быть от 10 до 50")

    total_points = sum(q.points for q in data.questions)
    if data.threshold_score > total_points:
        raise HTTPException(status_code=400, detail="Порог прохождения не может превышать сумму баллов за вопросы")

    test_obj.description = data.description
    test_obj.time_limit_minutes = data.time_limit_minutes
    test_obj.threshold_score = data.threshold_score
    test_obj.is_published = data.is_published

    # удаляем старые вопросы (каскадно удалятся ответы)
    await db.execute(delete(TestQuestion).where(TestQuestion.test_id == test_id))

    # добавляем новые вопросы и ответы
    for idx, q_data in enumerate(data.questions):
        new_q = TestQuestion(
            test_id=test_id,
            question_text=q_data.question_text,
            order_index=idx + 1,
            points=q_data.points
        )
        db.add(new_q)
        await db.flush()

        for a_idx, a_data in enumerate(q_data.answers):
            new_a = QuestionAnswer(
                question_id=new_q.id,
                answer_text=a_data.answer_text,
                is_correct=a_data.is_correct,
                order_index=a_idx + 1
            )
            db.add(new_a)

    await db.commit()
    return await get_test(test_id, db, claims)

@router.delete("/{test_id}")
async def delete_test(test_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    query = select(Test).where(Test.id == test_id)
    result = await db.execute(query)
    test_obj = result.scalar_one_or_none()
    if not test_obj:
        raise HTTPException(status_code=404, detail="Тест не найден")

    await db.delete(test_obj)
    await db.commit()
    return {"status": "ok"}
