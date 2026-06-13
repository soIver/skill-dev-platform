from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, func, and_, delete, update, exists
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    SkillLevelCreateRequest, SkillLevelSearchResponse, SkillLevelItem,
    SkillSearchResponse, SkillSearchItem, LevelSearchResponse, LevelSearchItem,
    SkillLevelDetail, LevelItem, SkillRelationItem,
    SkillLevelUpdateRequest,
    UserSkillResponse, UserSkillItem,
    UserPsFunctionsResponse, UserPsFunctionItem,
    UserPsFunctionsGroupItem, UserProfStandardItem,
)
from .utils import (
    get_level_index_normal, calculate_adjusted_score,
    calculate_confidence, calculate_vtotal,
)
from ..models import (
    Skill, Level, SkillLevel, RepoSkill, UserRepo, Test,
    TestAttempt, SkillRelation, TestGroup, TestPsFunction,
    TaskHistory, TaskHistoryFailedRequirement, TaskPsFunction,
    PsFunction, PsFunctionsGroup, ProfStandard,
)
from ..analysis.utils import get_embedding
from ..auth.service import TokenClaims
from ..auth.utils import resolve_author_filter
from ..config import global_config


class SkillService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_skills(self, name: str) -> SkillSearchResponse:
        query = (
            select(Skill.id, Skill.name)
            .order_by(Skill.name)
            .limit(20)
        )

        trimmed_name = name.strip()
        if trimmed_name:
            query = query.where(Skill.name.ilike(f"%{trimmed_name}%"))

        result = await self.db.execute(query)
        rows = result.all()

        return SkillSearchResponse(
            items=[SkillSearchItem(id=row.id, name=row.name) for row in rows]
        )

    async def search_levels(self, name: str) -> LevelSearchResponse:
        query = (
            select(Level.id, Level.name)
            .order_by(Level.name)
            .limit(20)
        )

        trimmed_name = name.strip()
        if trimmed_name:
            query = query.where(Level.name.ilike(f"%{trimmed_name}%"))

        result = await self.db.execute(query)
        rows = result.all()

        return LevelSearchResponse(
            items=[LevelSearchItem(id=row.id, name=row.name) for row in rows]
        )

    async def search_skill_levels(
        self,
        skill: str | None,
        level: str | None,
        author_id: int | None,
        page: int,
        limit: int,
        claims: TokenClaims,
    ) -> SkillLevelSearchResponse:
        resolved_author_id = resolve_author_filter(claims, author_id)
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
        if resolved_author_id is not None:
            query = query.where(SkillLevel.author_id == resolved_author_id)

        query = query.order_by(Skill.name, SkillLevel.order_index)

        # подсчёт
        count_subq = select(SkillLevel.id) \
            .join(Skill, SkillLevel.skill_id == Skill.id) \
            .join(Level, SkillLevel.level_id == Level.id)
        if skill:
            count_subq = count_subq.where(Skill.name.ilike(f"%{skill}%"))
        if level:
            count_subq = count_subq.where(Level.name.ilike(f"%{level}%"))
        if resolved_author_id is not None:
            count_subq = count_subq.where(SkillLevel.author_id == resolved_author_id)

        count_query = select(func.count()).select_from(count_subq.subquery())
        total_count = await self.db.scalar(count_query)
        total_pages = (total_count + limit - 1) // limit if total_count else 1

        offset = (page - 1) * limit
        query = query.offset(offset).limit(limit)
        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            obtained = await self.count_obtained(row.skill_id, row.id)
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

    async def _get_skill_level_indexes(self, skill_id: int) -> dict[int, int]:
        levels_result = await self.db.execute(
            select(SkillLevel.id)
            .where(SkillLevel.skill_id == skill_id)
            .order_by(SkillLevel.order_index, SkillLevel.id)
        )
        return {
            skill_level_id: index
            for index, skill_level_id in enumerate(levels_result.scalars().all())
        }

    async def _calculate_user_repo_score(self, user_id: int, skill_id: int) -> float | None:
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
        adjusted_scores = [
            calculate_adjusted_score(score, analyzed_at)
            for score, analyzed_at in repo_skills_result.all()
        ]
        if not adjusted_scores:
            return None

        avg_score = sum(adjusted_scores) / len(adjusted_scores)

        relations_result = await self.db.execute(
            select(SkillRelation.source_id, SkillRelation.influence_weight)
            .where(SkillRelation.target_id == skill_id)
        )
        relations = [(r.source_id, r.influence_weight) for r in relations_result.all()]
        if not relations:
            return avg_score

        source_ids = [source_id for source_id, _ in relations]
        source_scores_result = await self.db.execute(
            select(RepoSkill.skill_id, func.avg(RepoSkill.score).label("avg"))
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(
                UserRepo.user_id == user_id,
                RepoSkill.skill_id.in_(source_ids),
                UserRepo.analyzed_at >= cutoff_date,
            )
            .group_by(RepoSkill.skill_id)
        )
        source_scores = {row.skill_id: float(row.avg) for row in source_scores_result.all()}
        vtotal = calculate_vtotal(relations, source_scores, global_config.VTOTAL_EPSILON)
        return min(100.0, avg_score * vtotal)

    async def _calculate_repo_level_index(
        self,
        user_id: int,
        skill_id: int,
        num_levels: int,
    ) -> int | None:
        score = await self._calculate_user_repo_score(user_id, skill_id)
        if score is None:
            return None
        return get_level_index_normal(score, num_levels)

    async def _calculate_test_level_index(self, user_id: int, skill_level_indexes: dict[int, int]) -> int | None:
        if not skill_level_indexes:
            return None

        test_query = (
            select(TestGroup.skill_level_id)
            .select_from(TestAttempt)
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(
                TestAttempt.user_id == user_id,
                TestGroup.skill_level_id.in_(list(skill_level_indexes.keys())),
                Test.threshold_score.isnot(None),
                TestAttempt.score >= Test.threshold_score,
            )
        )
        test_result = await self.db.execute(test_query)
        passed_indexes = [
            skill_level_indexes[skill_level_id]
            for skill_level_id in test_result.scalars().all()
        ]
        if not passed_indexes:
            return None

        return max(passed_indexes)

    async def _calculate_user_level_index(
        self,
        user_id: int,
        skill_id: int,
        skill_level_indexes: dict[int, int],
    ) -> int | None:
        repo_index = await self._calculate_repo_level_index(
            user_id,
            skill_id,
            len(skill_level_indexes),
        )
        test_index = await self._calculate_test_level_index(user_id, skill_level_indexes)
        indexes = [index for index in (repo_index, test_index) if index is not None]
        if not indexes:
            return None

        return max(indexes)

    async def count_obtained(self, skill_id: int, target_skill_level_id: int) -> int:
        skill_level_indexes = await self._get_skill_level_indexes(skill_id)
        target_index = skill_level_indexes.get(target_skill_level_id)
        if target_index is None:
            return 0

        repo_users_query = (
            select(UserRepo.user_id)
            .join(RepoSkill, RepoSkill.repo_id == UserRepo.id)
            .where(RepoSkill.skill_id == skill_id)
            .distinct()
        )
        repo_users_result = await self.db.execute(repo_users_query)
        user_ids = set(repo_users_result.scalars().all())

        test_users_query = (
            select(TestAttempt.user_id)
            .select_from(TestAttempt)
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(
                TestGroup.skill_level_id.in_(list(skill_level_indexes.keys())),
                Test.threshold_score.isnot(None),
                TestAttempt.score >= Test.threshold_score,
            )
            .distinct()
        )
        test_users_result = await self.db.execute(test_users_query)
        user_ids.update(test_users_result.scalars().all())

        obtained_count = 0
        for user_id in user_ids:
            achieved_index = await self._calculate_user_level_index(
                user_id,
                skill_id,
                skill_level_indexes,
            )
            if achieved_index is not None and achieved_index >= target_index:
                obtained_count += 1

        return obtained_count

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
            obtained = await self.count_obtained(skill_obj.id, existing_obj.id)
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

        # связи влияющие на данный навык (входящие)
        incoming_res = await self.db.execute(
            select(SkillRelation.id, SkillRelation.source_id, Skill.name.label("skill_name"), SkillRelation.influence_weight)
            .join(Skill, SkillRelation.source_id == Skill.id)
            .where(SkillRelation.target_id == sl.skill_id)
        )
        # связи от данного навыка (исходящие)
        outgoing_res = await self.db.execute(
            select(SkillRelation.id, SkillRelation.target_id.label("skill_id"), Skill.name.label("skill_name"), SkillRelation.influence_weight)
            .join(Skill, SkillRelation.target_id == Skill.id)
            .where(SkillRelation.source_id == sl.skill_id)
        )

        relations_dict = {}

        for r in incoming_res.all():
            relations_dict[r.source_id] = {
                "skill_id": r.source_id,
                "skill_name": r.skill_name,
                "incoming_id": r.id,
                "incoming_weight": r.influence_weight,
                "outgoing_id": None,
                "outgoing_weight": None,
            }

        for r in outgoing_res.all():
            if r.skill_id not in relations_dict:
                relations_dict[r.skill_id] = {
                    "skill_id": r.skill_id,
                    "skill_name": r.skill_name,
                    "incoming_id": None,
                    "incoming_weight": None,
                    "outgoing_id": r.id,
                    "outgoing_weight": r.influence_weight,
                }
            else:
                relations_dict[r.skill_id]["outgoing_id"] = r.id
                relations_dict[r.skill_id]["outgoing_weight"] = r.influence_weight

        relations = [SkillRelationItem(**d) for d in relations_dict.values()]

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

        # точечное обновление связей
        provided_ids = set()

        for rel in data.relations:
            # incoming
            if rel.incoming_weight is not None and rel.incoming_weight > 0:
                if rel.incoming_id:
                    await self.db.execute(
                        update(SkillRelation)
                        .where(SkillRelation.id == rel.incoming_id)
                        .values(influence_weight=rel.incoming_weight)
                    )
                    provided_ids.add(rel.incoming_id)
                else:
                    new_inc = SkillRelation(source_id=rel.skill_id, target_id=sl.skill_id, influence_weight=rel.incoming_weight)
                    self.db.add(new_inc)
                    await self.db.flush()
                    provided_ids.add(new_inc.id)
            elif rel.incoming_id:
                await self.db.execute(delete(SkillRelation).where(SkillRelation.id == rel.incoming_id))

            # outgoing
            if rel.outgoing_weight is not None and rel.outgoing_weight > 0:
                if rel.outgoing_id:
                    await self.db.execute(
                        update(SkillRelation)
                        .where(SkillRelation.id == rel.outgoing_id)
                        .values(influence_weight=rel.outgoing_weight)
                    )
                    provided_ids.add(rel.outgoing_id)
                else:
                    new_out = SkillRelation(source_id=sl.skill_id, target_id=rel.skill_id, influence_weight=rel.outgoing_weight)
                    self.db.add(new_out)
                    await self.db.flush()
                    provided_ids.add(new_out.id)
            elif rel.outgoing_id:
                await self.db.execute(delete(SkillRelation).where(SkillRelation.id == rel.outgoing_id))

        # удаляем те связи текущего навыка, которые были убраны на клиенте
        if provided_ids:
            await self.db.execute(
                delete(SkillRelation)
                .where(
                    ((SkillRelation.source_id == sl.skill_id) | (SkillRelation.target_id == sl.skill_id))
                    & ~SkillRelation.id.in_(provided_ids)
                )
            )
        else:
            await self.db.execute(
                delete(SkillRelation)
                .where(
                    (SkillRelation.source_id == sl.skill_id) | (SkillRelation.target_id == sl.skill_id)
                )
            )

        await self.db.commit()
        return await self.get_skill_level(sl_id)

    async def delete_skill_level(self, sl_id: int):
        sl = await self.db.get(SkillLevel, sl_id)
        if not sl:
            raise HTTPException(status_code=404, detail="SkillLevel not found")

        # проверка наличия привязанных тестов
        test_count = await self.db.scalar(
            select(func.count(Test.id))
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(TestGroup.skill_level_id == sl_id)
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
            .join(TestGroup, TestGroup.skill_level_id == SkillLevel.id)
            .join(Test, Test.test_group_id == TestGroup.id)
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
        confidence = calculate_confidence(avg_score, num_levels, level_idx)

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
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(
                TestAttempt.user_id == user_id,
                TestGroup.skill_level_id == current_prof.id,
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

    async def get_my_ps_functions(self, user_id: int) -> UserPsFunctionsResponse:
        passed_test_function_ids_query = (
            select(TestPsFunction.ps_function_id)
            .join(TestGroup, TestPsFunction.test_group_id == TestGroup.id)
            .join(Test, Test.test_group_id == TestGroup.id)
            .join(TestAttempt, TestAttempt.test_id == Test.id)
            .where(
                TestAttempt.user_id == user_id,
                Test.threshold_score.isnot(None),
                TestAttempt.score >= Test.threshold_score,
            )
        )

        failed_requirements_exist = exists().where(
            TaskHistoryFailedRequirement.task_history_id == TaskHistory.id
        )
        completed_task_function_ids_query = (
            select(TaskPsFunction.ps_function_id)
            .join(TaskHistory, TaskPsFunction.task_id == TaskHistory.task_id)
            .where(
                TaskHistory.user_id == user_id,
                TaskHistory.completed_at.isnot(None),
                ~failed_requirements_exist,
            )
        )

        function_ids_result = await self.db.execute(
            passed_test_function_ids_query.union(completed_task_function_ids_query)
        )
        function_ids = [row[0] for row in function_ids_result.all()]
        if not function_ids:
            return UserPsFunctionsResponse(items=[])

        result = await self.db.execute(
            select(
                ProfStandard.id.label("ps_id"),
                ProfStandard.code.label("ps_code"),
                ProfStandard.name.label("ps_name"),
                PsFunctionsGroup.id.label("group_id"),
                PsFunctionsGroup.code.label("group_code"),
                PsFunctionsGroup.name.label("group_name"),
                PsFunctionsGroup.qualification_level,
                PsFunction.id.label("function_id"),
                PsFunction.code.label("function_code"),
                PsFunction.name.label("function_name"),
            )
            .join(PsFunctionsGroup, PsFunctionsGroup.ps_id == ProfStandard.id)
            .join(PsFunction, PsFunction.ps_functions_group_id == PsFunctionsGroup.id)
            .where(PsFunction.id.in_(function_ids))
            .order_by(ProfStandard.code, PsFunctionsGroup.code, PsFunction.code)
        )

        standards: dict[int, UserProfStandardItem] = {}
        groups_by_id: dict[int, UserPsFunctionsGroupItem] = {}
        for row in result.all():
            standard = standards.get(row.ps_id)
            if standard is None:
                standard = UserProfStandardItem(
                    id=row.ps_id,
                    code=row.ps_code,
                    name=row.ps_name,
                    groups=[],
                )
                standards[row.ps_id] = standard

            group = groups_by_id.get(row.group_id)
            if group is None:
                group = UserPsFunctionsGroupItem(
                    id=row.group_id,
                    code=row.group_code,
                    name=row.group_name,
                    qualification_level=row.qualification_level,
                    functions=[],
                )
                groups_by_id[row.group_id] = group
                standard.groups.append(group)

            group.functions.append(UserPsFunctionItem(
                id=row.function_id,
                code=row.function_code,
                name=row.function_name,
            ))

        return UserPsFunctionsResponse(items=list(standards.values()))
