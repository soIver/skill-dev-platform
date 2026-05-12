import asyncio
import json
from datetime import datetime, timezone, timedelta
import math

from redis.asyncio import from_url as redis_from_url
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from .app import celery_app
from ..analysis.analysers import analyzer 
from ..models import UserRepo, RepoSkill, Skill, Proficiency, UserProficiency
from ..config import global_config
from ..utils.logger import get_logger
from ..skills.utils import calculate_adjusted_score, get_level_index_normal

logger = get_logger("celery.tasks")


async def _publish_notification(user_id: int, payload: dict):
    """публикация уведомления через изолированный redis-клиент"""
    if not global_config.REDIS_URL:
        return
    redis = redis_from_url(
        global_config.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    try:
        await redis.publish(f"notifications:{user_id}", json.dumps(payload))
    finally:
        await redis.aclose()


async def _process_repository(
    user_id: int,
    repo_name: str,
    repo_url: str,
    previous_analyzed_at: str | None,
):
    # изолированный engine для celery-задачи, чтобы не конфликтовать с event loop FastAPI
    task_engine = create_async_engine(
        global_config.DATABASE_URL,
        pool_size=1,
        max_overflow=0,
    )
    TaskSession = async_sessionmaker(
        task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        async with TaskSession() as db:
            # запись уже создана роутером analysis/router.py
            query = select(UserRepo).where(
                UserRepo.user_id == user_id, UserRepo.name == repo_name
            )
            result = await db.execute(query)
            repo = result.scalar_one_or_none()

            if not repo:
                logger.error(f"UserRepo не найден для {repo_name} (user {user_id})")
                return

            # анализ
            extracted_skills = await analyzer.analyze(repo_url, db)

            for match in extracted_skills:
                skill_id = match["skill_id"]
                raw_score = match["score"]

                # вычисление давности для time decay
                last_seen = None

                # 1. проверяем RepoSkills из других репозиториев
                pending_query = (
                    select(func.max(UserRepo.analyzed_at))
                    .select_from(RepoSkill)
                    .join(UserRepo)
                    .where(
                        UserRepo.user_id == user_id,
                        RepoSkill.skill_id == skill_id,
                        UserRepo.id != repo.id,
                    )
                )
                pending_result = await db.execute(pending_query)
                pending_max = pending_result.scalar_one_or_none()
                if pending_max:
                    last_seen = pending_max

                # 2. проверяем UserProficiency
                if not last_seen:
                    up_query = (
                        select(UserProficiency)
                        .join(Proficiency)
                        .where(
                            UserProficiency.user_id == user_id,
                            Proficiency.skill_id == skill_id,
                        )
                    )
                    up_result = await db.execute(up_query)
                    user_prof = up_result.scalar_one_or_none()
                    if user_prof:
                        d = user_prof.repeated_date or user_prof.obtained_date
                        if d:
                            last_seen = datetime(
                                d.year, d.month, d.day, tzinfo=timezone.utc
                            )

                adjusted_score = calculate_adjusted_score(raw_score, last_seen)

                logger.debug(
                    f"Skill {skill_id}: raw={raw_score}, adjusted={adjusted_score}"
                )

                # присвоение навыка репозиторию
                repo_skill = RepoSkill(
                    repo_id=repo.id, skill_id=skill_id, score=adjusted_score
                )
                db.add(repo_skill)
                await db.commit()

                # обновление или создание записи компетенции
                up_q = select(UserProficiency).where(
                    UserProficiency.user_id == user_id,
                    UserProficiency.proficiency_id.in_(
                        select(Proficiency.id).where(Proficiency.skill_id == skill_id)
                    ),
                )
                up_res = await db.execute(up_q)
                user_prof = up_res.scalar_one_or_none()

                now_date = datetime.now(timezone.utc).date()

                if not user_prof:
                    # получение списка всех уровней компетенции для данного навыка
                    prof_query = (
                        select(Proficiency)
                        .where(Proficiency.skill_id == skill_id)
                        .order_by(Proficiency.order_index)
                    )
                    prof_res = await db.execute(prof_query)
                    proficiencies = prof_res.scalars().all()

                    if proficiencies:
                        num_levels = len(proficiencies)
                        level_idx = get_level_index_normal(adjusted_score, num_levels)
                        target_prof = proficiencies[level_idx]

                        user_prof = UserProficiency(
                            user_id=user_id,
                            proficiency_id=target_prof.id,
                            encountered_count=1,
                            obtained_date=now_date,
                            repeated_date=now_date,
                        )
                        db.add(user_prof)
                        logger.debug(
                            f"Пользователь {user_id} получил навык {skill_id}: "
                            f"присвоен {target_prof.order_index} уровень (по оценке {adjusted_score})"
                        )
                    else:
                        logger.warning(
                            f"Для навыка {skill_id} не найдены уровни компетенции"
                        )
                        continue
                else:
                    user_prof.encountered_count += 1
                    user_prof.repeated_date = now_date
                    logger.debug(
                        f"Навык {skill_id} встречен у пользователя {user_id} "
                        f"в {user_prof.encountered_count} раз"
                    )

                # каждые REPO_SKILL_COUNT_FOR_UPDATE встреч пересчитываем уровень
                if (
                    user_prof.encountered_count
                    % global_config.REPO_SKILL_COUNT_FOR_UPDATE
                    == 0
                ):
                    # вычисление среднего балла за последние MAX_DECAY_DAYS дней
                    cutoff_date = datetime.now(timezone.utc) - timedelta(
                        days=global_config.PROFICIENCY_CONFIDENCE_DECAY_MAX_DAYS
                    )

                    sum_query = (
                        select(func.sum(RepoSkill.score), func.count(RepoSkill.id))
                        .join(UserRepo)
                        .where(
                            UserRepo.user_id == user_id,
                            RepoSkill.skill_id == skill_id,
                            UserRepo.analyzed_at >= cutoff_date,
                        )
                    )
                    sum_res = await db.execute(sum_query)
                    total_score, count = sum_res.one()

                    if count > 0:
                        avg_score = total_score / count

                        # получение списка всех уровней компетенции для данного навыка
                        prof_query = (
                            select(Proficiency)
                            .where(Proficiency.skill_id == skill_id)
                            .order_by(Proficiency.order_index)
                        )
                        prof_res = await db.execute(prof_query)
                        proficiencies = prof_res.scalars().all()

                        if proficiencies:
                            num_levels = len(proficiencies)
                            level_idx = get_level_index_normal(avg_score, num_levels)
                            target_prof = proficiencies[level_idx]

                            if user_prof.proficiency_id != target_prof.id:
                                logger.debug(
                                    f"Уровень навыка {skill_id} пользователя {user_id} изменился: "
                                    f"{user_prof.proficiency_id} -> {target_prof.id} (avg: {avg_score:.2f})"
                                )
                                user_prof.proficiency_id = target_prof.id
                            else:
                                logger.debug(
                                    f"Уровень навыка {skill_id} пользователя {user_id} "
                                    f"подтверждён (avg: {avg_score:.2f})"
                                )

                await db.commit()

            repo.analyzed_at = datetime.now(timezone.utc)
            await db.commit()

        # уведомление об успехе
        await _publish_notification(user_id, {
            "type": "repository_analyzed",
            "repo_name": repo_name,
            "message": f"Анализ репозитория {repo_name} завершён.",
        })

    except Exception:
        # восстановление состояния при ошибке
        try:
            async with TaskSession() as db:
                query = select(UserRepo).where(
                    UserRepo.user_id == user_id, UserRepo.name == repo_name
                )
                result = await db.execute(query)
                repo = result.scalar_one_or_none()

                if repo:
                    if previous_analyzed_at:
                        # восстанавливаем предыдущее значение
                        repo.analyzed_at = datetime.fromisoformat(previous_analyzed_at)
                    else:
                        # запись была создана роутером для этого анализа — удаляем
                        await db.delete(repo)
                    await db.commit()
        except Exception as cleanup_err:
            logger.error(f"Ошибка при восстановлении состояния UserRepo: {cleanup_err}")

        # уведомление об ошибке
        try:
            await _publish_notification(user_id, {
                "type": "repository_analysis_failed",
                "repo_name": repo_name,
                "message": f"При анализе репозитория {repo_name} произошла ошибка.",
            })
        except Exception as notify_err:
            logger.error(f"Не удалось отправить уведомление об ошибке: {notify_err}")

        raise

    finally:
        await task_engine.dispose()


@celery_app.task(name="analyze_repository_task")
def analyze_repository_task(
    user_id: int,
    repo_name: str,
    repo_url: str,
    previous_analyzed_at: str | None = None,
):
    logger.debug(f"Начат процесс анализа репозитория {repo_name} (инициатор: {user_id})")
    asyncio.run(_process_repository(user_id, repo_name, repo_url, previous_analyzed_at))
    logger.debug(f"Процесс анализа репозитория {repo_name} завершён")
