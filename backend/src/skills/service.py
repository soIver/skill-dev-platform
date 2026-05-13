from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    SkillLevelCreateRequest, SkillLevelSearchResponse, SkillLevelItem,
    SkillSearchResponse, SkillSearchItem,
    SkillLevelDetail, LevelItem, SkillRelationItem,
    SkillLevelUpdateRequest,
    UserSkillResponse, UserSkillItem,
)
from .utils import (
    get_level_index_normal, calculate_adjusted_score,
    calculate_confidence, calculate_vtotal,
)
from ..models import (
    Skill, Level, SkillLevel, RepoSkill, UserRepo, Test,
    TestAttempt, SkillRelation,
)
from ..analysis.utils import get_embedding
from ..config import global_config


class SkillService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_skills(self, name: str) -> SkillSearchResponse:
        query = (
            select(Skill.id, Skill.name)
            .where(Skill.name.ilike(f"%{name}%"))
            .order_by(Skill.name)
            .limit(20)
        )
        result = await self.db.execute(query)
        rows = result.all()

        return SkillSearchResponse(
            items=[SkillSearchItem(id=row.id, name=row.name) for row in rows]
        )

    async def search_skill_levels(
        self,
        skill: str | None,
        level: str | None,
        page: int,
        limit: int,
    ) -> SkillLevelSearchResponse:
        query = select(
            SkillLevel.id,
            SkillLevel.skill_id,
            Skill.name.label("skill_name"),
            Level.name.label("level_name"),
            SkillLevel.order_index,
        ).join(Skill, SkillLevel.skill_id == Skill.id) \
         .join(Level, SkillLevel.level_id == Level.id)

        if skill:
            query = query.where(Skill.name.ilike(f"%{skill}%"))
        if level:
            query = query.where(Level.name.ilike(f"%{level}%"))

        query = query.order_by(Skill.name, SkillLevel.order_index)

        # подсчёт
        count_subq = select(SkillLevel.id) \
            .join(Skill, SkillLevel.skill_id == Skill.id) \
            .join(Level, SkillLevel.level_id == Level.id)
        if skill:
            count_subq = count_subq.where(Skill.name.ilike(f"%{skill}%"))
        if level:
            count_subq = count_subq.where(Level.name.ilike(f"%{level}%"))

        count_query = select(func.count()).select_from(count_subq.subquery())
        total_count = await self.db.scalar(count_query)
        total_pages = (total_count + limit - 1) // limit if total_count else 1

        offset = (page - 1) * limit
        query = query.offset(offset).limit(limit)
        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            obtained = await self.count_obtained(row.skill_id, row.order_index)
            items.append(SkillLevelItem(
                id=row.id,
                skill_name=row.skill_name,
                level_name=row.level_name,
                obtained_count=obtained,
            ))

        return SkillLevelSearchResponse(
            items=items,
            total_pages=total_pages,
            current_page=page,
        )

    async def count_obtained(self, skill_id: int, target_order: int) -> int:
        # количество уровней для навыка
        num_levels = await self.db.scalar(
            select(func.count(SkillLevel.id)).where(SkillLevel.skill_id == skill_id)
        )
        if not num_levels:
            return 0

        # переводим target_order из 1-based в 0-based для сравнения с get_level_index_normal
        target_index = target_order - 1

        user_ids = set()

        # пользователи из repo_skills
        repo_query = (
            select(UserRepo.user_id, func.avg(RepoSkill.score).label("avg_score"))
            .join(RepoSkill, RepoSkill.repo_id == UserRepo.id)
            .where(RepoSkill.skill_id == skill_id)
            .group_by(UserRepo.user_id)
        )
        repo_result = await self.db.execute(repo_query)
        for uid, avg_score in repo_result.all():
            level_idx = get_level_index_normal(float(avg_score), num_levels)
            if level_idx >= target_index:
                user_ids.add(uid)

        # пользователи из test_attempts
        sl_ids_query = (
            select(SkillLevel.id)
            .where(
                SkillLevel.skill_id == skill_id,
                SkillLevel.order_index >= target_order,
            )
        )
        test_query = (
            select(TestAttempt.user_id)
            .join(Test, TestAttempt.test_id == Test.id)
            .where(
                Test.skill_level_id.in_(sl_ids_query),
                Test.threshold_score.isnot(None),
                TestAttempt.score >= Test.threshold_score,
            )
            .distinct()
        )
        test_result = await self.db.execute(test_query)
        for (uid,) in test_result.all():
            user_ids.add(uid)

        return len(user_ids)

    async def create_skill_level(self, req: SkillLevelCreateRequest, author_id: int) -> SkillLevelItem:
        skill_result = await self.db.execute(select(Skill).where(Skill.name.ilike(req.skill_name)))
        skill_obj = skill_result.scalar_one_or_none()

        if not skill_obj:
            embedding = await get_embedding(req.skill_name)
            skill_obj = Skill(name=req.skill_name, embedding=embedding)
            self.db.add(skill_obj)
            await self.db.flush()

        level_result = await self.db.execute(select(Level).where(Level.name.ilike(req.level_name)))
        level_obj = level_result.scalar_one_or_none()

        if not level_obj:
            level_obj = Level(name=req.level_name)
            self.db.add(level_obj)
            await self.db.flush()

        existing = await self.db.execute(
            select(SkillLevel).where(
                and_(SkillLevel.skill_id == skill_obj.id, SkillLevel.level_id == level_obj.id)
            )
        )
        existing_obj = existing.scalar_one_or_none()

        if existing_obj:
            obtained = await self.count_obtained(skill_obj.id, existing_obj.order_index)
            return SkillLevelItem(
                id=existing_obj.id,
                skill_name=skill_obj.name,
                level_name=level_obj.name,
                obtained_count=obtained,
            )

        max_idx = await self.db.scalar(
            select(func.max(SkillLevel.order_index)).where(SkillLevel.skill_id == skill_obj.id)
        )
        new_order_index = (max_idx + 1) if max_idx is not None else 1

        new_sl = SkillLevel(
            skill_id=skill_obj.id,
            level_id=level_obj.id,
            order_index=new_order_index,
            author_id=author_id,
        )
        self.db.add(new_sl)
        await self.db.commit()
        await self.db.refresh(new_sl)

        return SkillLevelItem(
            id=new_sl.id,
            skill_name=skill_obj.name,
            level_name=level_obj.name,
            obtained_count=0,
        )

    async def get_skill_level(self, sl_id: int) -> SkillLevelDetail:
        sl = await self.db.get(SkillLevel, sl_id)
        if not sl:
            raise HTTPException(status_code=404, detail="SkillLevel not found")

        skill = await self.db.get(Skill, sl.skill_id)

        # все уровни этого навыка
        levels_result = await self.db.execute(
            select(SkillLevel.id, Level.name.label("level_name"), SkillLevel.order_index)
            .join(Level, SkillLevel.level_id == Level.id)
            .where(SkillLevel.skill_id == sl.skill_id)
            .order_by(SkillLevel.order_index)
        )
        levels = [
            LevelItem(id=r.id, level_name=r.level_name, order_index=r.order_index)
            for r in levels_result.all()
        ]

        # связи влияющие на данный навык
        relations_result = await self.db.execute(
            select(SkillRelation.id, SkillRelation.source_id, Skill.name.label("source_name"), SkillRelation.influence_weight)
            .join(Skill, SkillRelation.source_id == Skill.id)
            .where(SkillRelation.target_id == sl.skill_id)
        )
        relations = [
            SkillRelationItem(
                id=r.id,
                source_id=r.source_id,
                source_name=r.source_name,
                influence_weight=r.influence_weight,
            )
            for r in relations_result.all()
        ]

        return SkillLevelDetail(
            id=sl.id,
            skill_id=sl.skill_id,
            skill_name=skill.name,
            levels=levels,
            relations=relations,
        )

    async def update_skill_level(self, sl_id: int, data: SkillLevelUpdateRequest) -> SkillLevelDetail:
        sl = await self.db.get(SkillLevel, sl_id)
        if not sl:
            raise HTTPException(status_code=404, detail="SkillLevel not found")

        # обновление порядка уровней
        for idx, level_id in enumerate(data.level_order, start=1):
            level_sl = await self.db.get(SkillLevel, level_id)
            if level_sl and level_sl.skill_id == sl.skill_id:
                level_sl.order_index = idx

        # пересоздание связей
        await self.db.execute(
            delete(SkillRelation).where(SkillRelation.target_id == sl.skill_id)
        )
        for rel in data.relations:
            self.db.add(SkillRelation(
                source_id=rel.source_id,
                target_id=sl.skill_id,
                influence_weight=rel.influence_weight,
            ))

        await self.db.commit()
        return await self.get_skill_level(sl_id)

    async def delete_skill_level(self, sl_id: int):
        sl = await self.db.get(SkillLevel, sl_id)
        if not sl:
            raise HTTPException(status_code=404, detail="SkillLevel not found")

        # проверка наличия привязанных тестов
        test_count = await self.db.scalar(
            select(func.count(Test.id)).where(Test.skill_level_id == sl_id)
        )
        if test_count and test_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Невозможно удалить: к навыку привязаны тесты. "
                       "Перейдите во вкладку Тесты и перепривяжите все варианты теста к другому навыку.",
            )

        skill_id = sl.skill_id
        await self.db.delete(sl)
        await self.db.flush()

        # пересчёт индексов оставшихся уровней
        remaining = await self.db.execute(
            select(SkillLevel)
            .where(SkillLevel.skill_id == skill_id)
            .order_by(SkillLevel.order_index)
        )
        for idx, level in enumerate(remaining.scalars().all(), start=1):
            level.order_index = idx

        await self.db.commit()

    async def get_my_skills(
        self,
        user_id: int,
        page: int,
        limit: int,
    ) -> UserSkillResponse:
        # уникальные навыки из репозиториев
        skill_ids_query = (
            select(RepoSkill.skill_id)
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user_id, RepoSkill.skill_id.isnot(None))
            .distinct()
        )
        skill_ids_result = await self.db.execute(skill_ids_query)
        repo_skill_ids = {row[0] for row in skill_ids_result.all()}

        # навыки из успешных тестов
        test_skill_ids_query = (
            select(SkillLevel.skill_id)
            .join(Test, Test.skill_level_id == SkillLevel.id)
            .join(TestAttempt, TestAttempt.test_id == Test.id)
            .where(
                TestAttempt.user_id == user_id,
                Test.threshold_score.isnot(None),
                TestAttempt.score >= Test.threshold_score,
            )
            .distinct()
        )
        test_skill_ids_result = await self.db.execute(test_skill_ids_query)
        test_skill_ids = {row[0] for row in test_skill_ids_result.all()}

        all_skill_ids = sorted(repo_skill_ids | test_skill_ids)

        total_count = len(all_skill_ids)
        total_pages = (total_count + limit - 1) // limit if total_count else 1

        # пагинация
        offset = (page - 1) * limit
        page_skill_ids = all_skill_ids[offset:offset + limit]

        items = []
        for skill_id in page_skill_ids:
            item = await self.compute_user_skill(user_id, skill_id)
            if item:
                items.append(item)

        return UserSkillResponse(
            items=items,
            total_pages=total_pages,
            current_page=page,
        )

    async def compute_user_skill(self, user_id: int, skill_id: int) -> UserSkillItem | None:
        # уровни навыка
        levels_result = await self.db.execute(
            select(SkillLevel)
            .join(Level, SkillLevel.level_id == Level.id)
            .where(SkillLevel.skill_id == skill_id)
            .order_by(SkillLevel.order_index)
        )
        proficiencies = levels_result.scalars().all()
        if not proficiencies:
            return None

        num_levels = len(proficiencies)
        skill = await self.db.get(Skill, skill_id)
        if not skill:
            return None

        # средний балл за последнее время с учётом устаревания
        cutoff_date = datetime.now(timezone.utc) - timedelta(
            days=global_config.SKILL_SCORE_DECAY_MAX_DAYS
        )
        repo_skills_result = await self.db.execute(
            select(RepoSkill.score, UserRepo.analyzed_at)
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(
                UserRepo.user_id == user_id,
                RepoSkill.skill_id == skill_id,
                UserRepo.analyzed_at >= cutoff_date,
            )
            .order_by(UserRepo.analyzed_at.desc())
            .limit(5)
        )
        repo_data = repo_skills_result.all()

        adjusted_scores = []
        for score, analyzed_at in repo_data:
            adj = calculate_adjusted_score(score, analyzed_at)
            adjusted_scores.append(adj)

        # определение уровня
        if adjusted_scores:
            avg_score = sum(adjusted_scores) / len(adjusted_scores)
        else:
            avg_score = 0.0

        # применение корректировки по связям навыков
        relations_result = await self.db.execute(
            select(SkillRelation.source_id, SkillRelation.influence_weight)
            .where(SkillRelation.target_id == skill_id)
        )
        relations = [(r.source_id, r.influence_weight) for r in relations_result.all()]

        if relations:
            source_ids = [r[0] for r in relations]
            cutoff_src = datetime.now(timezone.utc) - timedelta(
                days=global_config.SKILL_SCORE_DECAY_MAX_DAYS
            )
            src_scores_result = await self.db.execute(
                select(RepoSkill.skill_id, func.avg(RepoSkill.score).label("avg"))
                .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
                .where(
                    UserRepo.user_id == user_id,
                    RepoSkill.skill_id.in_(source_ids),
                    UserRepo.analyzed_at >= cutoff_src,
                )
                .group_by(RepoSkill.skill_id)
            )
            source_scores = {row.skill_id: float(row.avg) for row in src_scores_result.all()}
            vtotal = calculate_vtotal(relations, source_scores, global_config.VTOTAL_EPSILON)
            avg_score = min(100.0, avg_score * vtotal)

        level_idx = get_level_index_normal(avg_score, num_levels)
        current_prof = proficiencies[level_idx]

        # загрузка имени уровня
        current_level = await self.db.get(Level, current_prof.level_id)
        level_name = current_level.name if current_level else "Неизвестно"

        # расчёт уверенности
        next_level_order = current_prof.order_index + 1
        confidence = calculate_confidence(adjusted_scores, num_levels, next_level_order)

        # штраф за малую выборку
        n_query = select(func.count(RepoSkill.id)).join(UserRepo).where(
            UserRepo.user_id == user_id,
            RepoSkill.skill_id == skill_id,
        )
        n = await self.db.scalar(n_query) or 0
        a = (global_config.REPO_SKILL_COUNT_FOR_UPDATE / 2) - n
        if a > 0:
            confidence = confidence * (1 - 0.1 * a)

        # множитель на основе попыток прохождения тестов
        test_cutoff = datetime.now(timezone.utc) - timedelta(
            days=global_config.DAYS_FOR_TEST_ATTEMPT * 2
        )
        test_attempt_query = (
            select(TestAttempt, Test)
            .join(Test, TestAttempt.test_id == Test.id)
            .where(
                TestAttempt.user_id == user_id,
                Test.skill_level_id == current_prof.id,
                TestAttempt.completed_at >= test_cutoff,
            )
            .order_by(TestAttempt.completed_at.desc())
            .limit(1)
        )
        test_attempt_res = await self.db.execute(test_attempt_query)
        test_attempt_data = test_attempt_res.first()

        if test_attempt_data:
            ta, test = test_attempt_data
            m = ta.score / test.threshold_score if test.threshold_score else 1.0
            confidence = confidence * m
        else:
            confidence = confidence * 0.7

        confidence = min(1.0, max(0.0, confidence))

        return UserSkillItem(
            id=current_prof.id,
            skill_name=skill.name,
            level_name=level_name,
            confidence=round(confidence, 2),
        )
