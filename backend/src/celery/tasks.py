import asyncio
import json
from datetime import datetime, timezone
import math

from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from .app import celery_app
from ..analysis.analysers import analyzer 
from ..utils.database import AsyncSessionLocal
from ..models import UserRepo, RepoSkill, Skill, Proficiency, UserProficiency
from ..config import global_config
from ..utils.logger import get_logger
from ..github.service import GitHubService

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
                analyzed_at=datetime.now(timezone.utc)
            )
            db.add(repo)
            await db.commit()
            await db.refresh(repo)
        else:
            repo.analyzed_at = datetime.now(timezone.utc)
            await db.commit()

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
                        # Convert date to datetime
                        last_seen = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)

            n = 0
            if last_seen:
                delta_days = (datetime.now(timezone.utc) - last_seen).days
                n = max(0, delta_days // 3)

            decay_factor = max(1.0 - 0.2 * n, 0.2)
            adjusted_score = int(raw_score * decay_factor)
            
            logger.info(f"Skill {skill_id}: raw={raw_score}, n={n}, decay={decay_factor}, adjusted={adjusted_score}")

            # Add RepoSkill
            repo_skill = RepoSkill(
                repo_id=repo.id,
                skill_id=skill_id,
                score=adjusted_score
            )
            db.add(repo_skill)
            await db.commit()

            # Check if 5 repos reached
            count_query = select(func.count(RepoSkill.id)).join(UserRepo).where(
                UserRepo.user_id == user_id,
                RepoSkill.skill_id == skill_id
            )
            count_result = await db.execute(count_query)
            count = count_result.scalar_one()

            if count >= 5:
                # Average score
                sum_query = select(func.sum(RepoSkill.score)).join(UserRepo).where(
                    UserRepo.user_id == user_id,
                    RepoSkill.skill_id == skill_id
                )
                sum_result = await db.execute(sum_query)
                total_score = sum_result.scalar_one()
                avg_score = total_score / count

                # Get all proficiencies for this skill
                prof_query = select(Proficiency).where(Proficiency.skill_id == skill_id).order_by(Proficiency.order_index)
                prof_result = await db.execute(prof_query)
                proficiencies = prof_result.scalars().all()

                if proficiencies:
                    num_levels = len(proficiencies)
                    step = 100.0 / num_levels
                    # E.g. score 45, 5 levels -> step 20 -> 45 / 20 = 2.25 -> ceil -> 3 -> index 2
                    level_idx = max(0, min(num_levels - 1, math.ceil(avg_score / step) - 1))
                    target_prof = proficiencies[level_idx]

                    # Update or create UserProficiency
                    up_q = select(UserProficiency).join(Proficiency).where(
                        UserProficiency.user_id == user_id,
                        Proficiency.skill_id == skill_id
                    )
                    up_res = await db.execute(up_q)
                    user_prof = up_res.scalar_one_or_none()

                    if user_prof:
                        user_prof.proficiency_id = target_prof.id
                        user_prof.repeated_date = datetime.now(timezone.utc).date()
                    else:
                        new_up = UserProficiency(
                            user_id=user_id,
                            proficiency_id=target_prof.id,
                            obtained_date=datetime.now(timezone.utc).date()
                        )
                        db.add(new_up)

                    # Delete the RepoSkills
                    del_query = delete(RepoSkill).where(
                        RepoSkill.id.in_(
                            select(RepoSkill.id).join(UserRepo).where(
                                UserRepo.user_id == user_id,
                                RepoSkill.skill_id == skill_id
                            )
                        )
                    )
                    await db.execute(del_query)
                    await db.commit()
                    
                    logger.info(f"Assigned proficiency {target_prof.id} to user {user_id} for skill {skill_id} (avg: {avg_score})")

        # Publish notification
        redis = GitHubService._get_redis()
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
    logger.debug(f"Процесс анализа репозитория {repo_name} закончен")
