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
from ..models import UserRepo, RepoSkill, SkillLevel
from ..config import global_config
from ..utils.logger import get_logger

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

                logger.debug(f"Skill {skill_id}: raw={raw_score}")

                # сохраняем чистую оценку LLM;
                # устаревание (time decay) и связи (vtotal) применяются динамически при чтении
                repo_skill = RepoSkill(
                    repo_id=repo.id, skill_id=skill_id, score=raw_score
                )
                db.add(repo_skill)
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
