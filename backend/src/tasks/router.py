from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_, exists, case
from sqlalchemy.orm import selectinload

from ..auth.utils import require_role, resolve_author_filter
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import (
    Task, UserRepo, GitHubRepo, TaskHistory, UserRecommendation,
    SkillLevelTask, SkillLevel, Skill, Level, TaskPsFunction, PsFunction,
    TaskRequirement, TaskHistoryFailedRequirement,
)
from .schemas import (
    TaskSearchResponse,
    TaskItem,
    TaskDetail,
    SkillTaskItem,
    TaskCreateUpdate,
    TaskPublicItem,
    TaskPublicSearchResponse,
    PsFunctionItem,
    TaskRequirementItem,
    TaskLatestAttemptItem,
    TaskFailedRequirementItem,
)

router = APIRouter(tags=["tasks"])


async def _load_latest_task_attempts(
    db: AsyncSession,
    user_id: int,
    task_ids: list[int],
) -> dict[int, TaskLatestAttemptItem]:
    if not task_ids:
        return {}

    latest_ids_subq = (
        select(func.max(TaskHistory.id).label("history_id"))
        .where(
            TaskHistory.user_id == user_id,
            TaskHistory.task_id.in_(task_ids),
        )
        .group_by(TaskHistory.task_id)
        .subquery()
    )
    failed_count_sq = (
        select(func.count(TaskHistoryFailedRequirement.id))
        .where(TaskHistoryFailedRequirement.task_history_id == TaskHistory.id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(
            TaskHistory.id,
            TaskHistory.task_id,
            GitHubRepo.name.label("repo_name"),
            GitHubRepo.url.label("repo_url"),
            TaskHistory.completed_at,
            failed_count_sq.label("failed_count"),
        )
        .join(latest_ids_subq, latest_ids_subq.c.history_id == TaskHistory.id)
        .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
        .join(GitHubRepo, UserRepo.repo_id == GitHubRepo.id)
    )

    rows = result.all()
    history_ids = [row.id for row in rows]
    failed_map: dict[int, list[TaskFailedRequirementItem]] = {}
    if history_ids:
        failed_result = await db.execute(
            select(
                TaskHistoryFailedRequirement.task_history_id,
                TaskHistoryFailedRequirement.task_requirement_id,
                TaskRequirement.description,
            )
            .join(TaskRequirement, TaskHistoryFailedRequirement.task_requirement_id == TaskRequirement.id)
            .where(TaskHistoryFailedRequirement.task_history_id.in_(history_ids))
            .order_by(TaskHistoryFailedRequirement.id)
        )
        for row in failed_result.all():
            failed_map.setdefault(row.task_history_id, []).append(
                TaskFailedRequirementItem(
                    id=row.task_requirement_id,
                    description=row.description,
                )
            )

    return {
        row.task_id: TaskLatestAttemptItem(
            repo_name=row.repo_name,
            repo_url=row.repo_url,
            completed_at=row.completed_at,
            successful=(row.failed_count or 0) == 0,
            failed_requirements=failed_map.get(row.id, []),
        )
        for row in rows
    }


async def _load_task_requirements(db: AsyncSession, task_ids: list[int]) -> dict[int, list[TaskRequirementItem]]:
    if not task_ids:
        return {}

    result = await db.execute(
        select(TaskRequirement.task_id, TaskRequirement.id, TaskRequirement.description)
        .where(TaskRequirement.task_id.in_(task_ids))
        .order_by(TaskRequirement.task_id, TaskRequirement.id)
    )

    requirements_map: dict[int, list[TaskRequirementItem]] = {}
    for row in result.all():
        requirements_map.setdefault(row.task_id, []).append(
            TaskRequirementItem(id=row.id, description=row.description)
        )
    return requirements_map


async def _load_task_ps_functions(db: AsyncSession, task_ids: list[int]) -> dict[int, list[PsFunctionItem]]:
    if not task_ids:
        return {}

    result = await db.execute(
        select(TaskPsFunction.task_id, PsFunction.id, PsFunction.code, PsFunction.name)
        .join(PsFunction, TaskPsFunction.ps_function_id == PsFunction.id)
        .where(TaskPsFunction.task_id.in_(task_ids))
        .order_by(TaskPsFunction.task_id, PsFunction.code, PsFunction.name)
    )

    functions_map: dict[int, list[PsFunctionItem]] = {}
    for row in result.all():
        functions_map.setdefault(row.task_id, []).append(
            PsFunctionItem(id=row.id, code=row.code, name=row.name)
        )
    return functions_map


def _unique_ids(ids: list[int]) -> list[int]:
    return list(dict.fromkeys(ids))


def _normalize_requirements(data: TaskCreateUpdate) -> list[str]:
    descriptions = [item.description.strip() for item in data.requirements]
    if any(len(description) < 16 or len(description) > 64 for description in descriptions):
        raise HTTPException(status_code=400, detail="Длина требования должна быть от 16 до 64 символов")
    if len(descriptions) < 2 or len(descriptions) > 10:
        raise HTTPException(status_code=400, detail="Количество требований должно быть от 2 до 10")
    return descriptions


async def _sync_task_requirements(db: AsyncSession, task_id: int, data: TaskCreateUpdate):
    existing_result = await db.execute(
        select(TaskRequirement).where(TaskRequirement.task_id == task_id)
    )
    existing_by_id = {
        requirement.id: requirement
        for requirement in existing_result.scalars().all()
    }
    received_ids = set()

    for item in data.requirements:
        description = item.description.strip()
        if item.id and item.id in existing_by_id:
            existing_by_id[item.id].description = description
            received_ids.add(item.id)
        else:
            db.add(TaskRequirement(task_id=task_id, description=description))

    stale_ids = set(existing_by_id) - received_ids
    if stale_ids:
        await db.execute(delete(TaskRequirement).where(TaskRequirement.id.in_(stale_ids)))


def _split_search_terms(keyword: str | None) -> list[str]:
    if not keyword:
        return []
    return list(dict.fromkeys(
        term.strip()
        for term in keyword.split(",")
        if term.strip()
    ))


def _task_keyword_match(term: str):
    pattern = f"%{term}%"
    skill_level_match = (
        select(SkillLevelTask.task_id)
        .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
        .join(Skill, SkillLevel.skill_id == Skill.id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(SkillLevelTask.task_id == Task.id)
        .where(or_(
            Skill.name.ilike(pattern),
            Level.name.ilike(pattern),
            func.concat(Skill.name, " - ", Level.name).ilike(pattern),
        ))
        .exists()
    )
    return or_(
        Task.title.ilike(pattern),
        Task.description.ilike(pattern),
        skill_level_match,
    )


def _sum_rank(expressions: list):
    rank = None
    for expression in expressions:
        value = case((expression, 1), else_=0)
        rank = value if rank is None else rank + value
    return rank


def _task_ps_function_rank(ps_function_ids: list[int]):
    if not ps_function_ids:
        return None
    return (
        select(func.count(func.distinct(TaskPsFunction.ps_function_id)))
        .where(
            TaskPsFunction.task_id == Task.id,
            TaskPsFunction.ps_function_id.in_(ps_function_ids),
        )
        .correlate(Task)
        .scalar_subquery()
    )


@router.get("/tasks")
async def search_tasks(
    keyword: str = Query(None),
    skill_query: str = Query(None),
    skill_level_ids: list[int] = Query(default=[]),
    ps_function_ids: list[int] = Query(default=[]),
    author_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    only_published: bool = Query(False),
    only_uncompleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    """поиск заданий — расширенный ответ для куратора/администратора, публичный для пользователя"""
    is_privileged = claims.role in ("curator", "admin")
    resolved_author_id = resolve_author_filter(claims, author_id) if is_privileged else None
    skill_level_sq = None
    unique_ps_function_ids = _unique_ids(ps_function_ids)
    keyword_matches = [_task_keyword_match(term) for term in _split_search_terms(keyword)]
    keyword_rank = _sum_rank(keyword_matches)
    ps_function_rank = _task_ps_function_rank(unique_ps_function_ids)
    rank_expr = keyword_rank
    if ps_function_rank is not None:
        rank_expr = ps_function_rank if rank_expr is None else rank_expr + ps_function_rank
    failed_requirements_exists = exists().where(
        TaskHistoryFailedRequirement.task_history_id == TaskHistory.id
    ).correlate(TaskHistory)
    successful_task_attempt_exists = exists().where(
        TaskHistory.task_id == Task.id,
        TaskHistory.user_id == claims.user_id,
        TaskHistory.completed_at.isnot(None),
        ~failed_requirements_exists,
    ).correlate(Task)

    # базовые условия
    if is_privileged and not only_published:
        base_query = select(Task)
    else:
        # пользователи (или принудительно) видят только опубликованные задания
        base_query = select(Task).where(Task.is_published == True)

    if keyword_matches:
        base_query = base_query.where(or_(*keyword_matches))
    if ps_function_rank is not None:
        base_query = base_query.where(ps_function_rank > 0)
    if only_uncompleted:
        base_query = base_query.where(~successful_task_attempt_exists)
    if resolved_author_id is not None:
        base_query = base_query.where(Task.author_id == resolved_author_id)

    # фильтрация по строке навыка (для куратора/администратора)
    skill_sq = None
    if skill_query and is_privileged:
        if " - " in skill_query:
            skill_part, level_part = skill_query.split(" - ", 1)
        else:
            skill_part = skill_query
            level_part = None

        skill_sq = (
            select(SkillLevelTask.task_id)
            .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
            .join(Skill, SkillLevel.skill_id == Skill.id)
            .join(Level, SkillLevel.level_id == Level.id)
            .where(Skill.name.ilike(f"%{skill_part}%"))
        )
        if level_part:
            skill_sq = skill_sq.where(Level.name.ilike(f"%{level_part}%"))
        base_query = base_query.where(Task.id.in_(skill_sq))

    # OR-фильтрация по конкретным skill_level_id (для всех ролей)
    if skill_level_ids:
        skill_level_sq = select(SkillLevelTask.task_id).where(SkillLevelTask.skill_level_id.in_(skill_level_ids))
        base_query = base_query.where(Task.id.in_(skill_level_sq))

    # подсчёт
    count_query = select(func.count()).select_from(
        base_query.with_only_columns(Task.id).subquery()
    )
    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    # расширенные подзапросы только для куратора/администратора
    if is_privileged:
        issued_count_sq = select(func.count(UserRecommendation.id)).where(UserRecommendation.task_id == Task.id).scalar_subquery()
        failed_attempt_exists = exists().where(
            TaskHistoryFailedRequirement.task_history_id == TaskHistory.id
        )
        completed_count_sq = (
            select(func.count(TaskHistory.id))
            .where(
                TaskHistory.task_id == Task.id,
                ~failed_attempt_exists,
            )
            .scalar_subquery()
        )

        full_query = select(
            Task,
            issued_count_sq.label("issued_count"),
            completed_count_sq.label("completed_count")
        )
        if keyword_matches:
            full_query = full_query.where(or_(*keyword_matches))
        if ps_function_rank is not None:
            full_query = full_query.where(ps_function_rank > 0)
        if only_uncompleted:
            full_query = full_query.where(~successful_task_attempt_exists)
        if resolved_author_id is not None:
            full_query = full_query.where(Task.author_id == resolved_author_id)
        if skill_sq is not None:
            full_query = full_query.where(Task.id.in_(skill_sq))
        if skill_level_sq is not None:
            full_query = full_query.where(Task.id.in_(skill_level_sq))
        if not is_privileged or only_published:
            full_query = full_query.where(Task.is_published == True)

        order_by = []
        if rank_expr is not None:
            order_by.append(rank_expr.desc())
        order_by.extend([issued_count_sq.desc(), Task.id])

        full_query = full_query.options(
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.skill),
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.level)
        ).order_by(*order_by)
        full_query = full_query.offset((page - 1) * limit).limit(limit)
        result = await db.execute(full_query)
        rows = result.all()
        task_ids = [row[0].id for row in rows]

        attempts_map = await _load_latest_task_attempts(db, claims.user_id, task_ids)
        ps_functions_map = await _load_task_ps_functions(db, task_ids)

        items = []
        for row in rows:
            task_obj = row[0]
            desc = task_obj.description or ""
            status = "Опубликовано" if task_obj.is_published else "Сохранено"
            
            latest_attempt = attempts_map.get(task_obj.id)
            
            items.append(TaskItem(
                id=task_obj.id,
                title=task_obj.title,
                description_preview=desc,
                issued_count=row[1],
                completed_count=row[2] or 0,
                status=status,
                skills=[
                    SkillTaskItem(
                        skill_level_id=slt.skill_level.id,
                        skill_name=slt.skill_level.skill.name,
                        level_name=slt.skill_level.level.name
                    ) for slt in task_obj.skill_level_tasks
                ],
                ps_functions=ps_functions_map.get(task_obj.id, []),
                attached_repo_name=latest_attempt.repo_name if latest_attempt and latest_attempt.successful else None,
                latest_attempt=latest_attempt
            ))

        return TaskSearchResponse(items=items, total_pages=total_pages, current_page=page)

    else:
        # публичный ответ
        order_by = []
        if rank_expr is not None:
            order_by.append(rank_expr.desc())
        order_by.append(Task.id)

        base_query = base_query.options(
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.skill),
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.level)
        ).order_by(*order_by).offset((page - 1) * limit).limit(limit)

        result = await db.execute(base_query)
        tasks = result.scalars().all()
        
        task_ids = [t.id for t in tasks]
        attempts_map = await _load_latest_task_attempts(db, claims.user_id, task_ids)
        ps_functions_map = await _load_task_ps_functions(db, task_ids)

        items = [
            TaskPublicItem(
                id=task.id, 
                title=task.title, 
                description_preview=task.description,
                skills=[
                    SkillTaskItem(
                        skill_level_id=slt.skill_level.id,
                        skill_name=slt.skill_level.skill.name,
                        level_name=slt.skill_level.level.name
                    ) for slt in task.skill_level_tasks
                ],
                ps_functions=ps_functions_map.get(task.id, []),
                attached_repo_name=attempts_map[task.id].repo_name if task.id in attempts_map and attempts_map[task.id].successful else None,
                latest_attempt=attempts_map.get(task.id)
            ) for task in tasks
        ]
        return TaskPublicSearchResponse(items=items, total_pages=total_pages, current_page=page)

@router.get("/tasks/check_title")
async def check_task_title(
    title: str,
    exclude_id: int = Query(None),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin"))
):
    query = select(Task.id).where(func.lower(Task.title) == title.lower())
    if exclude_id:
        query = query.where(Task.id != exclude_id)
    result = await db.execute(query)
    exists = result.scalar_one_or_none() is not None
    return {"is_taken": exists}

@router.get("/tasks/{rec_id}", response_model=TaskDetail)
async def get_task(rec_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    query = select(Task).where(Task.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()

    if not rec:
        raise HTTPException(status_code=404, detail="Task not found")

    skills_query = (
        select(SkillLevelTask, SkillLevel, Skill, Level)
        .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
        .join(Skill, SkillLevel.skill_id == Skill.id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(SkillLevelTask.task_id == rec_id)
    )
    skills_result = await db.execute(skills_query)

    skills_items = []
    for sr, sl, sk, lv in skills_result.all():
        skills_items.append(SkillTaskItem(
            skill_level_id=sl.id,
            skill_name=sk.name,
            level_name=lv.name
        ))

    requirements_map = await _load_task_requirements(db, [rec_id])
    attempts_map = await _load_latest_task_attempts(db, claims.user_id, [rec_id])
    ps_functions_map = await _load_task_ps_functions(db, [rec_id])
    latest_attempt = attempts_map.get(rec_id)

    return TaskDetail(
        id=rec.id,
        title=rec.title,
        description=rec.description,
        is_published=rec.is_published,
        skills=skills_items,
        requirements=requirements_map.get(rec_id, []),
        ps_functions=ps_functions_map.get(rec_id, []),
        attached_repo_name=latest_attempt.repo_name if latest_attempt and latest_attempt.successful else None,
        latest_attempt=latest_attempt
    )

@router.get("/tasks/{task_id}/public", response_model=TaskDetail)
async def get_task_public(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    query = select(Task).where(Task.id == task_id, Task.is_published == True)
    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Задание не найдено или не опубликовано")

    skills_query = (
        select(SkillLevelTask, SkillLevel, Skill, Level)
        .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
        .join(Skill, SkillLevel.skill_id == Skill.id)
        .join(Level, SkillLevel.level_id == Level.id)
        .where(SkillLevelTask.task_id == task_id)
    )
    skills_result = await db.execute(skills_query)

    skills_items = []
    for sr, sl, sk, lv in skills_result.all():
        skills_items.append(SkillTaskItem(
            skill_level_id=sl.id,
            skill_name=sk.name,
            level_name=lv.name
        ))

    requirements_map = await _load_task_requirements(db, [task_id])
    attempts_map = await _load_latest_task_attempts(db, claims.user_id, [task_id])
    ps_functions_map = await _load_task_ps_functions(db, [task_id])
    latest_attempt = attempts_map.get(task_id)

    return TaskDetail(
        id=task.id,
        title=task.title,
        description=task.description,
        is_published=True,
        skills=skills_items,
        requirements=requirements_map.get(task_id, []),
        ps_functions=ps_functions_map.get(task_id, []),
        attached_repo_name=latest_attempt.repo_name if latest_attempt and latest_attempt.successful else None,
        latest_attempt=latest_attempt
    )

@router.post("/tasks", response_model=TaskDetail)
async def create_task(data: TaskCreateUpdate, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    _normalize_requirements(data)
    rec = Task(
        title=data.title,
        description=data.description,
        is_published=data.is_published,
        author_id=claims.user_id
    )
    db.add(rec)
    await db.flush()

    for sl_id in data.skill_level_ids:
        db.add(SkillLevelTask(
            skill_level_id=sl_id,
            task_id=rec.id
        ))

    for ps_function_id in _unique_ids(data.ps_function_ids):
        db.add(TaskPsFunction(
            task_id=rec.id,
            ps_function_id=ps_function_id
        ))
    await _sync_task_requirements(db, rec.id, data)

    await db.commit()
    return await get_task(rec.id, db, claims)

@router.put("/tasks/{rec_id}", response_model=TaskDetail)
async def update_task(
    rec_id: int,
    data: TaskCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
    _normalize_requirements(data)
    query = select(Task).where(Task.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()

    if not rec:
        raise HTTPException(status_code=404, detail="Task not found")

    rec.title = data.title
    rec.description = data.description
    rec.is_published = data.is_published

    # удаление старых навыков
    await db.execute(delete(SkillLevelTask).where(SkillLevelTask.task_id == rec_id))
    await db.execute(delete(TaskPsFunction).where(TaskPsFunction.task_id == rec_id))

    # добавление новых навыков
    for sl_id in data.skill_level_ids:
        db.add(SkillLevelTask(
            skill_level_id=sl_id,
            task_id=rec.id
        ))

    for ps_function_id in _unique_ids(data.ps_function_ids):
        db.add(TaskPsFunction(
            task_id=rec.id,
            ps_function_id=ps_function_id
        ))
    await _sync_task_requirements(db, rec.id, data)

    await db.commit()
    return await get_task(rec.id, db, claims)

@router.delete("/tasks/{rec_id}")
async def delete_task(rec_id: int, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
    query = select(Task).where(Task.id == rec_id)
    result = await db.execute(query)
    rec = result.scalar_one_or_none()

    if not rec:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(rec)
    await db.commit()
    return {"status": "ok"}
