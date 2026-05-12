import asyncio
import json
from datetime import datetime, timezone, timedelta
import math

from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from .app import celery_app
from ..analysis.analysers import analyzer 
from ..utils.database import AsyncSessionLocal
from ..models import UserRepo, RepoSkill, Skill, Proficiency, UserProficiency
from ..config import global_config
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from ..skills.utils import calculate_adjusted_score

logger = get_logger("celery.tasks")

async def _process_repository(user_id: int, repo_name: str, repo_url: str):
    async with AsyncSessionLocal() as db:
        # Check if repo already exists, or create
        query = select(UserRepo).where(UserRepo.user_id == user_id, UserRepo.name == repo_name)
        result = await db.execute(query)
        repo = result.scalar_one_or_none()

        if not repo:
            repo = UserRepo(
                user_id=user_id,
                gh_id=0, # We might need actual gh_id, but for now 0
                name=repo_name,
                analyzed_at=None
            )
            db.add(repo)
            await db.commit()
            await db.refresh(repo)

        # Analyze
        extracted_skills = await analyzer.analyze(repo_url, db)

        for match in extracted_skills:
            skill_id = match["skill_id"]
            raw_score = match["score"]

            # Calculate n for time decay
            # Find last seen date
            last_seen = None
            
            # 1. Check pending RepoSkills
            pending_query = select(func.max(UserRepo.analyzed_at)).select_from(RepoSkill).join(UserRepo).where(
                UserRepo.user_id == user_id,
                RepoSkill.skill_id == skill_id,
                UserRepo.id != repo.id
            )
            pending_result = await db.execute(pending_query)
            pending_max = pending_result.scalar_one_or_none()
            if pending_max:
                last_seen = pending_max

            # 2. Check UserProficiency
            if not last_seen:
                up_query = select(UserProficiency).join(Proficiency).where(
                    UserProficiency.user_id == user_id,
                    Proficiency.skill_id == skill_id
                )
                up_result = await db.execute(up_query)
                user_prof = up_result.scalar_one_or_none()
                if user_prof:
                    d = user_prof.repeated_date or user_prof.obtained_date
                    if d:
                        last_seen = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)

            adjusted_score = calculate_adjusted_score(raw_score, last_seen)
            
            logger.debug(f"Skill {skill_id}: raw={raw_score}, adjusted={adjusted_score}")

            # присвоение навыка репозиторию
            repo_skill = RepoSkill(
                repo_id=repo.id,
                skill_id=skill_id,
                score=adjusted_score
            )
            db.add(repo_skill)
            await db.commit()

            # Обновление или создание записи компетенции
            up_q = select(UserProficiency).where(
                UserProficiency.user_id == user_id,
                # Ищем по skill_id через Proficiency
                UserProficiency.proficiency_id.in_(
                    select(Proficiency.id).where(Proficiency.skill_id == skill_id)
                )
            )
            up_res = await db.execute(up_q)
            user_prof = up_res.scalar_one_or_none()

            now_date = datetime.now(timezone.utc).date()

            if not user_prof:
                # поиск 1 уровня компетенции для данного навыка
                first_prof_q = select(Proficiency).where(
                    Proficiency.skill_id == skill_id,
                    Proficiency.order_index == 1
                )
                first_prof_res = await db.execute(first_prof_q)
                first_prof = first_prof_res.scalar_one_or_none()

                if first_prof:
                    user_prof = UserProficiency(
                        user_id=user_id,
                        proficiency_id=first_prof.id,
                        encountered_count=1,
                        obtained_date=now_date,
                        repeated_date=now_date
                    )
                    db.add(user_prof)
                    logger.debug(f"Пользователь {user_id} получил навык {skill_id}: присвоен 1 уровень")
                else:
                    logger.warning(f"Для навыка {skill_id} не найден 1 уровень компетенции")
                    continue
            else:
                user_prof.encountered_count += 1
                user_prof.repeated_date = now_date
                logger.debug(f"Навык {skill_id} встречен у пользователя {user_id} в {user_prof.encountered_count} раз")

            # Каждые REPO_SKILL_COUNT_FOR_UPDATE встреч пересчитываем уровень
            if user_prof.encountered_count % global_config.REPO_SKILL_COUNT_FOR_UPDATE == 0:
                # Вычисление среднего балла за последние MAX_DECAY_DAYS дней
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=global_config.MAX_DECAY_DAYS)
                
                sum_query = select(func.sum(RepoSkill.score), func.count(RepoSkill.id)).join(UserRepo).where(
                    UserRepo.user_id == user_id,
                    RepoSkill.skill_id == skill_id,
                    UserRepo.analyzed_at >= cutoff_date
                )
                sum_res = await db.execute(sum_query)
                total_score, count = sum_res.one()

                if count > 0:
                    avg_score = total_score / count
                    
                    # Получение списка всех уровней компетенции для данного навыка
                    prof_query = select(Proficiency).where(Proficiency.skill_id == skill_id).order_by(Proficiency.order_index)
                    prof_res = await db.execute(prof_query)
                    proficiencies = prof_res.scalars().all()

                    if proficiencies:
                        num_levels = len(proficiencies)
                        step = 100.0 / num_levels
                        level_idx = max(0, min(num_levels - 1, math.ceil(avg_score / step) - 1))
                        target_prof = proficiencies[level_idx]
                        
                        if user_prof.proficiency_id != target_prof.id:
                            logger.debug(f"Уровень навыка {skill_id} пользователя {user_id} изменился: {user_prof.proficiency_id} -> {target_prof.id} (avg: {avg_score:.2f})")
                            user_prof.proficiency_id = target_prof.id
                        else:
                            logger.debug(f"Уровень навыка {skill_id} пользователя {user_id} подтверждён (avg: {avg_score:.2f})")
                
            await db.commit()

        repo.analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        # публикация уведомления для клиента о завершении анализа
        redis = get_redis()
        if redis:
            payload = json.dumps({
                "type": "repository_analyzed",
                "repo_name": repo_name,
                "message": f"Анализ репозитория {repo_name} завершён."
            })
            await redis.publish(f"notifications:{user_id}", payload)

@celery_app.task(name="analyze_repository_task")
def analyze_repository_task(user_id: int, repo_name: str, repo_url: str):
    logger.debug(f"Начат процесс анализа репозитория {repo_name} (инициатор: {user_id})")
    asyncio.run(_process_repository(user_id, repo_name, repo_url))
    logger.debug(f"Процесс анализа репозитория {repo_name} завершён")
