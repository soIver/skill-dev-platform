import asyncio
import json
from datetime import datetime, timezone, timedelta
import math

from redis.asyncio import from_url as redis_from_url
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from .app import celery_app
from ..analysis.analysers import RepositoryTooLargeError, analyzer
from ..models import UserRepo, GitHubRepo, RepoSkill, SkillLevel, TaskHistory
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
    task_id: int | None = None,
    skill_names: list[str] | None = None,
    task_description: str | None = None,
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
            query = (
                select(UserRepo)
                .options(selectinload(UserRepo.repo))
                .join(GitHubRepo, UserRepo.repo_id == GitHubRepo.id)
                .where(UserRepo.user_id == user_id, GitHubRepo.url == repo_url)
            )
            result = await db.execute(query)
            repo = result.scalar_one_or_none()

            if not repo:
                logger.error(f"UserRepo не найден для {repo_name} (user {user_id})")
                return

            repository_payload = await analyzer.ingest_repository(repo_url)
            repo.repo.tokens = repository_payload.tokens

            if analyzer.is_repository_too_large(repository_payload.tokens):
                repo.analyzed_at = datetime.now(timezone.utc)
                await db.commit()
                await _publish_repository_too_large_notification(
                    user_id,
                    repo_name,
                    RepositoryTooLargeError(
                        repository_payload.tokens,
                        analyzer.max_payload_tokens,
                    ),
                )
                return

            await db.commit()
            await _publish_notification(user_id, {
                "type": "repository_analysis_processing",
                "repo_name": repo_name,
            })

            extracted = await analyzer.extract_skills(
                repository_payload.payload,
                skill_names=skill_names,
                task_description=task_description,
            )
            extracted_skills = await analyzer.match_skills(db, extracted, analyzer.DISTANCE_TRESHOLD)

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
            if task_id:
                db.add(TaskHistory(
                    user_id=user_id,
                    task_id=task_id,
                    repo_id=repo.id,
                    completed_at=repo.analyzed_at,
                    successful=True,
                ))
            await db.commit()

        # уведомление об успехе
        await _publish_notification(user_id, {
            "type": "repository_analyzed",
            "repo_name": repo_name,
            "message": f"Анализ репозитория {repo_name} завершён.",
        })

    except Exception:
        await _cleanup_repository_state(user_id, repo_name, previous_analyzed_at, task_engine)
        raise

    finally:
        await task_engine.dispose()


async def _publish_repository_too_large_notification(
    user_id: int,
    repo_name: str,
    exc: RepositoryTooLargeError,
):
    logger.info(
        "Репозиторий %s слишком большой: %s токенов при лимите %s",
        repo_name,
        exc.actual_tokens,
        exc.max_tokens,
    )
    await _publish_notification(user_id, {
        "type": "repository_analysis_failed",
        "repo_name": repo_name,
        "status": "Недоступен",
        "message": str(exc),
    })


async def _cleanup_repository_state(
    user_id: int, 
    repo_name: str, 
    previous_analyzed_at: str | None,
    engine: any = None,
    message: str | None = None,
):
    """восстановление состояния БД и уведомление пользователя при ошибке"""
    internal_engine = engine
    if not internal_engine:
        internal_engine = create_async_engine(
            global_config.DATABASE_URL,
            pool_size=1,
            max_overflow=0,
        )
    
    try:
        TaskSession = async_sessionmaker(internal_engine, class_=AsyncSession, expire_on_commit=False)
        async with TaskSession() as db:
            query = (
                select(UserRepo)
                .options(selectinload(UserRepo.repo))
                .join(GitHubRepo, UserRepo.repo_id == GitHubRepo.id)
                .where(UserRepo.user_id == user_id, GitHubRepo.name == repo_name)
            )
            result = await db.execute(query)
            repo = result.scalar_one_or_none()

            too_large_error = None
            if repo:
                if repo.repo and analyzer.is_repository_too_large(repo.repo.tokens):
                    repo.analyzed_at = datetime.now(timezone.utc)
                    too_large_error = RepositoryTooLargeError(
                        repo.repo.tokens,
                        analyzer.max_payload_tokens,
                    )
                elif previous_analyzed_at:
                    repo.analyzed_at = datetime.fromisoformat(previous_analyzed_at)
                else:
                    await db.delete(repo)
                await db.commit()

            if too_large_error:
                message = str(too_large_error)
                status = "Недоступен"
            else:
                status = None
    except Exception as e:
        logger.error(f"Не удалось восстановить состояние БД: {e}")
        status = None
    finally:
        if not engine:
            await internal_engine.dispose()

    try:
        payload = {
            "type": "repository_analysis_failed",
            "repo_name": repo_name,
            "message": message or f"При анализе репозитория {repo_name} произошла ошибка.",
        }
        if status:
            payload["status"] = status
        await _publish_notification(user_id, payload)
    except Exception as e:
        logger.error(f"Не удалось отправить уведомление об ошибке: {e}")


@celery_app.task(name="analyze_repository_task")
def analyze_repository_task(
    user_id: int,
    repo_name: str,
    repo_url: str,
    previous_analyzed_at: str | None = None,
    task_id: int | None = None,
    skill_names: list[str] | None = None,
    task_description: str | None = None,
):
    logger.debug(f"Начат процесс анализа репозитория {repo_name} (инициатор: {user_id})")
    try:
        asyncio.run(_process_repository(user_id, repo_name, repo_url, previous_analyzed_at, task_id, skill_names, task_description))
        logger.debug(f"Процесс анализа репозитория {repo_name} завершён")
    except Exception as e:
        logger.error(f"Критическая ошибка в Celery-задаче для {repo_name}: {e}")
        # принудительная очистка, если asyncio.run упал или произошла иная ошибка уровня задачи
        asyncio.run(_cleanup_repository_state(user_id, repo_name, previous_analyzed_at))
        raise
