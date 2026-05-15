from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_
from sqlalchemy.orm import selectinload

from ..auth.utils import require_role
from ..auth.service import TokenClaims
from ..utils.database import get_db
from ..models import Task, UserRecommendation, TaskScore, SkillLevelTask, SkillLevel, Skill, Level
from .schemas import (
    TaskSearchResponse,
    TaskItem,
    TaskDetail,
    SkillTaskItem,
    TaskCreateUpdate,
    TaskPublicItem,
    TaskPublicSearchResponse,
)

router = APIRouter(tags=["tasks"])

@router.get("/tasks")
async def search_tasks(
    keyword: str = Query(None),
    skill_query: str = Query(None),
    skill_level_ids: list[int] = Query(default=[]),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("user", "curator", "admin")),
):
    """поиск заданий — расширенный ответ для куратора/администратора, публичный для пользователя"""
    is_privileged = claims.role in ("curator", "admin")

    # базовые условия
    if is_privileged:
        base_query = select(Task)
    else:
        # пользователи видят только опубликованные задания
        base_query = select(Task).where(Task.is_published == True)

    if keyword:
        base_query = base_query.where(or_(Task.title.ilike(f"%{keyword}%"), Task.description.ilike(f"%{keyword}%")))

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

    # AND-фильтрация по конкретным skill_level_id (для всех ролей)
    for sl_id in skill_level_ids:
        sq = select(SkillLevelTask.task_id).where(SkillLevelTask.skill_level_id == sl_id)
        base_query = base_query.where(Task.id.in_(sq))

    # подсчёт
    count_query = select(func.count()).select_from(
        base_query.with_only_columns(Task.id).subquery()
    )
    total_count = await db.scalar(count_query)
    total_pages = (total_count + limit - 1) // limit if total_count else 1

    # расширенные подзапросы только для куратора/администратора
    if is_privileged:
        issued_count_sq = select(func.count(UserRecommendation.id)).where(UserRecommendation.task_id == Task.id).scalar_subquery()
        average_rating_sq = select(func.avg(TaskScore.score)).where(TaskScore.task_id == Task.id).scalar_subquery()

        full_query = select(
            Task,
            issued_count_sq.label("issued_count"),
            average_rating_sq.label("average_rating")
        )
        if keyword:
            full_query = full_query.where(or_(Task.title.ilike(f"%{keyword}%"), Task.description.ilike(f"%{keyword}%")))
        if skill_sq is not None:
            full_query = full_query.where(Task.id.in_(skill_sq))
        for sl_id in skill_level_ids:
            sq = select(SkillLevelTask.task_id).where(SkillLevelTask.skill_level_id == sl_id)
            full_query = full_query.where(Task.id.in_(sq))
        if not is_privileged:
            full_query = full_query.where(Task.is_published == True)

        full_query = full_query.options(
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.skill),
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.level)
        ).order_by(issued_count_sq.desc(), Task.id)
        full_query = full_query.offset((page - 1) * limit).limit(limit)
        result = await db.execute(full_query)
        rows = result.all()

        items = []
        for row in rows:
            task_obj = row.Task
            desc = task_obj.description or ""
            avg_rating = row.average_rating
            rating_str = "-" if avg_rating is None or avg_rating == 0 else str(round(avg_rating, 1))
            status = "Опубликовано" if task_obj.is_published else "Сохранено"
            items.append(TaskItem(
                id=task_obj.id,
                title=task_obj.title,
                description_preview=desc,
                issued_count=row.issued_count,
                average_rating=rating_str,
                status=status,
                skills=[
                    SkillTaskItem(
                        skill_level_id=slt.skill_level.id,
                        skill_name=slt.skill_level.skill.name,
                        level_name=slt.skill_level.level.name
                    ) for slt in task_obj.skill_level_tasks
                ]
            ))

        return TaskSearchResponse(items=items, total_pages=total_pages, current_page=page)

    else:
        # публичный ответ
        base_query = base_query.options(
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.skill),
            selectinload(Task.skill_level_tasks).joinedload(SkillLevelTask.skill_level).joinedload(SkillLevel.level)
        ).order_by(Task.id).offset((page - 1) * limit).limit(limit)
        result = await db.execute(base_query)
        tasks = result.scalars().all()

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
                ]
            )
            for task in tasks
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

    return TaskDetail(
        id=rec.id,
        title=rec.title,
        description=rec.description,
        is_published=rec.is_published,
        skills=skills_items
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

    return TaskDetail(
        id=task.id,
        title=task.title,
        description=task.description,
        is_published=task.is_published,
        skills=skills_items
    )

@router.post("/tasks", response_model=TaskDetail)
async def create_task(data: TaskCreateUpdate, db: AsyncSession = Depends(get_db), claims: TokenClaims = Depends(require_role("curator", "admin"))):
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

    await db.commit()
    return await get_task(rec.id, db, claims)

@router.put("/tasks/{rec_id}", response_model=TaskDetail)
async def update_task(
    rec_id: int,
    data: TaskCreateUpdate,
    db: AsyncSession = Depends(get_db),
    claims: TokenClaims = Depends(require_role("curator", "admin")),
):
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

    # добавление новых навыков
    for sl_id in data.skill_level_ids:
        db.add(SkillLevelTask(
            skill_level_id=sl_id,
            task_id=rec.id
        ))

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
