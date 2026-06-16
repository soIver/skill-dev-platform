from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import func, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    RecommendationItem,
    RecommendationListResponse,
    RecommendationPsFunctionItem,
    RecommendationSkillLevelItem,
    RecommendationSkipResponse,
)
from ..config import global_config
from ..models import (
    GitHubRepo,
    Level,
    ProfStandard,
    PsFunction,
    PsFunctionsGroup,
    RepoSkill,
    Skill,
    SkillLevel,
    SkillLevelTask,
    SkillRelation,
    Task,
    TaskHistory,
    TaskHistoryFailedRequirement,
    TaskPsFunction,
    Test,
    TestAttempt,
    TestGroup,
    TestPsFunction,
    UserRepo,
)
from ..skills.utils import calculate_adjusted_score, calculate_confidence, calculate_vtotal, get_level_index_normal
from ..utils.redis import get_redis


ACTIVE_USERS_KEY = "recommendations:active_users"


@dataclass(slots=True)
class StoredRecommendation:
    id: str
    content_type: str
    target_id: int
    score: float
    status: str
    created_at: datetime
    expires_at: datetime


@dataclass(slots=True)
class CandidateRecommendation:
    content_type: str
    target_id: int
    score: float

    @property
    def id(self) -> str:
        return f"{self.content_type}-{self.target_id}"


@dataclass(slots=True)
class SkillProfile:
    skill_id: int
    current_skill_level_id: int
    current_order_index: int
    confidence: float
    score: float


class RecommendationService:
    def __init__(self, db: AsyncSession, redis: Redis | None = None):
        self.db = db
        self.redis = redis or get_redis()

    async def list_recommendations(self, user_id: int) -> RecommendationListResponse:
        stored = await self._cleanup_and_load(user_id)
        active_items = [item for item in stored if item.status == "active"]
        active_items.sort(key=lambda item: item.score, reverse=True)

        skips_used = await self._count_recent_skips(user_id)
        enriched = await self._enrich(active_items)
        return RecommendationListResponse(
            items=enriched,
            skip_limit=global_config.RECOMMENDATION_SKIP_LIMIT_PER_WEEK,
            skips_used=skips_used,
            skips_available=max(0, global_config.RECOMMENDATION_SKIP_LIMIT_PER_WEEK - skips_used),
        )

    async def skip_recommendation(self, user_id: int, recommendation_id: str) -> RecommendationSkipResponse:
        stored = await self._cleanup_and_load(user_id)
        item = next((candidate for candidate in stored if candidate.id == recommendation_id), None)
        if item is None or item.status != "active":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Рекомендация не найдена")

        skips_used = await self._count_recent_skips(user_id)
        if skips_used >= global_config.RECOMMENDATION_SKIP_LIMIT_PER_WEEK:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Лимит пропусков рекомендаций за неделю исчерпан",
            )

        now = self._now()
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                self._item_key(user_id, recommendation_id),
                mapping={
                    "status": "skipped",
                    "skipped_at": self._format_dt(now),
                },
            )
            pipeline.zadd(self._skips_key(user_id), {recommendation_id: now.timestamp()})
            pipeline.expire(self._skips_key(user_id), self._week_seconds() + 3600)
            await pipeline.execute()

        skips_used += 1
        return RecommendationSkipResponse(
            skipped=True,
            skips_used=skips_used,
            skips_available=max(0, global_config.RECOMMENDATION_SKIP_LIMIT_PER_WEEK - skips_used),
        )

    async def generate_missing_recommendations(self, user_id: int) -> int:
        stored = await self._cleanup_and_load(user_id)
        active_count = sum(1 for item in stored if item.status == "active")
        missing_count = global_config.RECOMMENDATION_MAX_ACTIVE - active_count
        if missing_count <= 0:
            return 0

        excluded_ids = {item.id for item in stored}
        candidates = await self._build_candidates(user_id, excluded_ids)
        if not candidates:
            return 0

        created = 0
        for candidate in candidates[:missing_count]:
            await self._store_candidate(user_id, candidate)
            created += 1
        return created

    async def complete_task_recommendation(self, user_id: int, task_id: int) -> None:
        await self._delete_recommendation(user_id, f"task-{task_id}")

    async def complete_test_recommendation(self, user_id: int, skill_level_id: int) -> None:
        await self._delete_recommendation(user_id, f"test-{skill_level_id}")

    async def build_skill_gap_recommendations(
        self,
        user_id: int,
        gaps: list[dict],
        limit: int = 5,
    ) -> list[RecommendationItem]:
        if not gaps:
            return []

        completed_task_ids = await self._load_successful_task_ids(user_id)
        candidates: list[CandidateRecommendation] = []
        used_ids: set[str] = set()

        for gap in gaps:
            skill_id = int(gap["skill_id"])
            required_order_index = gap.get("required_order_index")
            if required_order_index is None:
                continue

            current_order_index = gap.get("current_order_index")
            min_order_index = required_order_index
            if current_order_index is not None:
                min_order_index = min(required_order_index, int(current_order_index) + 1)

            test_candidate = await self._build_gap_test_candidate(
                skill_id,
                min_order_index,
                required_order_index,
                used_ids,
            )
            if test_candidate:
                candidates.append(test_candidate)
                used_ids.add(test_candidate.id)
                continue

            task_candidate = await self._build_gap_task_candidate(
                skill_id,
                min_order_index,
                required_order_index,
                completed_task_ids,
                used_ids,
            )
            if task_candidate:
                candidates.append(task_candidate)
                used_ids.add(task_candidate.id)

            if len(candidates) >= limit:
                break

        return await self._enrich_candidates(candidates[:limit])

    async def _build_gap_test_candidate(
        self,
        skill_id: int,
        min_order_index: int,
        required_order_index: int,
        used_ids: set[str],
    ) -> CandidateRecommendation | None:
        result = await self.db.execute(
            select(SkillLevel.id, SkillLevel.order_index)
            .join(TestGroup, TestGroup.skill_level_id == SkillLevel.id)
            .join(Test, Test.test_group_id == TestGroup.id)
            .where(
                SkillLevel.skill_id == skill_id,
                SkillLevel.order_index >= min_order_index,
                SkillLevel.order_index <= required_order_index,
                Test.is_published == True,
            )
            .group_by(SkillLevel.id, SkillLevel.order_index)
            .order_by(SkillLevel.order_index, SkillLevel.id)
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None
        candidate = CandidateRecommendation("test", row.id, 1.0)
        return None if candidate.id in used_ids else candidate

    async def _build_gap_task_candidate(
        self,
        skill_id: int,
        min_order_index: int,
        required_order_index: int,
        completed_task_ids: set[int],
        used_ids: set[str],
    ) -> CandidateRecommendation | None:
        result = await self.db.execute(
            select(Task.id, SkillLevel.order_index)
            .join(SkillLevelTask, SkillLevelTask.task_id == Task.id)
            .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
            .where(
                Task.is_published == True,
                SkillLevel.skill_id == skill_id,
                SkillLevel.order_index >= min_order_index,
                SkillLevel.order_index <= required_order_index,
            )
            .order_by(SkillLevel.order_index, Task.id)
        )
        for row in result.all():
            if row.id in completed_task_ids:
                continue
            candidate = CandidateRecommendation("task", row.id, 0.9)
            if candidate.id not in used_ids:
                return candidate
        return None

    async def _enrich_candidates(self, candidates: list[CandidateRecommendation]) -> list[RecommendationItem]:
        now = self._now()
        expires_at = now + timedelta(days=global_config.RECOMMENDATION_TTL_DAYS)
        stored = [
            StoredRecommendation(
                id=candidate.id,
                content_type=candidate.content_type,
                target_id=candidate.target_id,
                score=candidate.score,
                status="active",
                created_at=now,
                expires_at=expires_at,
            )
            for candidate in candidates
        ]
        return await self._enrich(stored)

    async def _build_candidates(self, user_id: int, excluded_ids: set[str]) -> list[CandidateRecommendation]:
        skill_profiles = await self._load_skill_profiles(user_id)
        missing_function_priorities = await self._load_missing_function_priorities(user_id)
        last_tests = await self._load_last_test_dates(user_id)
        last_tasks = await self._load_last_task_dates(user_id)
        completed_task_ids = await self._load_successful_task_ids(user_id)

        candidates: list[CandidateRecommendation] = []
        candidates.extend(await self._build_task_candidates(
            excluded_ids,
            completed_task_ids,
            skill_profiles,
            missing_function_priorities,
            last_tasks,
        ))
        candidates.extend(await self._build_test_candidates(
            excluded_ids,
            skill_profiles,
            missing_function_priorities,
            last_tests,
        ))
        candidates.sort(key=lambda item: item.score, reverse=True)
        return candidates

    async def _build_task_candidates(
        self,
        excluded_ids: set[str],
        completed_task_ids: set[int],
        skill_profiles: dict[int, SkillProfile],
        missing_function_priorities: dict[int, float],
        last_tasks: dict[int, datetime],
    ) -> list[CandidateRecommendation]:
        task_rows = await self.db.execute(
            select(Task.id)
            .where(Task.is_published == True)
            .order_by(Task.id)
        )
        task_ids = [
            task_id
            for task_id in task_rows.scalars().all()
            if task_id not in completed_task_ids and f"task-{task_id}" not in excluded_ids
        ]
        if not task_ids:
            return []

        skill_rows = await self.db.execute(
            select(SkillLevelTask.task_id, SkillLevelTask.skill_level_id, SkillLevel.skill_id, SkillLevel.order_index)
            .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
            .where(SkillLevelTask.task_id.in_(task_ids))
        )
        skills_by_task: dict[int, list[tuple[int, int, int]]] = {}
        for row in skill_rows.all():
            skills_by_task.setdefault(row.task_id, []).append((
                row.skill_level_id,
                row.skill_id,
                row.order_index,
            ))

        function_rows = await self.db.execute(
            select(TaskPsFunction.task_id, TaskPsFunction.ps_function_id)
            .where(TaskPsFunction.task_id.in_(task_ids))
        )
        functions_by_task: dict[int, list[int]] = {}
        for row in function_rows.all():
            functions_by_task.setdefault(row.task_id, []).append(row.ps_function_id)

        candidates: list[CandidateRecommendation] = []
        for task_id in task_ids:
            skill_score = self._score_skill_targets(skills_by_task.get(task_id, []), skill_profiles, last_tasks)
            function_score = max(
                (missing_function_priorities.get(function_id, 0.0) for function_id in functions_by_task.get(task_id, [])),
                default=0.0,
            )
            score = 0.65 * skill_score + 0.35 * function_score
            if score > 0:
                candidates.append(CandidateRecommendation("task", task_id, round(score, 4)))
        return candidates

    async def _build_test_candidates(
        self,
        excluded_ids: set[str],
        skill_profiles: dict[int, SkillProfile],
        missing_function_priorities: dict[int, float],
        last_tests: dict[int, datetime],
    ) -> list[CandidateRecommendation]:
        group_rows = await self.db.execute(
            select(TestGroup.id, TestGroup.skill_level_id, SkillLevel.skill_id, SkillLevel.order_index)
            .join(SkillLevel, TestGroup.skill_level_id == SkillLevel.id)
            .join(Test, Test.test_group_id == TestGroup.id)
            .where(Test.is_published == True)
            .group_by(TestGroup.id, TestGroup.skill_level_id, SkillLevel.skill_id, SkillLevel.order_index)
        )
        group_data = group_rows.all()
        if not group_data:
            return []

        group_ids = [row.id for row in group_data]
        function_rows = await self.db.execute(
            select(TestPsFunction.test_group_id, TestPsFunction.ps_function_id)
            .where(TestPsFunction.test_group_id.in_(group_ids))
        )
        functions_by_group: dict[int, list[int]] = {}
        for row in function_rows.all():
            functions_by_group.setdefault(row.test_group_id, []).append(row.ps_function_id)

        best_by_level: dict[int, CandidateRecommendation] = {}
        for row in group_data:
            skill_level_id = row.skill_level_id
            rec_id = f"test-{skill_level_id}"
            if rec_id in excluded_ids:
                continue

            skill_score = self._score_skill_targets(
                [(skill_level_id, row.skill_id, row.order_index)],
                skill_profiles,
                last_tests,
            )
            function_score = max(
                (missing_function_priorities.get(function_id, 0.0) for function_id in functions_by_group.get(row.id, [])),
                default=0.0,
            )
            score = 0.7 * skill_score + 0.3 * function_score
            if score <= 0:
                continue

            candidate = CandidateRecommendation("test", skill_level_id, round(score, 4))
            current = best_by_level.get(skill_level_id)
            if current is None or candidate.score > current.score:
                best_by_level[skill_level_id] = candidate

        return list(best_by_level.values())

    def _score_skill_targets(
        self,
        targets: list[tuple[int, int, int]],
        skill_profiles: dict[int, SkillProfile],
        last_dates: dict[int, datetime],
    ) -> float:
        best_score = 0.0
        for skill_level_id, skill_id, order_index in targets:
            profile = skill_profiles.get(skill_id)
            if profile is None:
                continue

            level_distance = order_index - profile.current_order_index
            if level_distance < -1:
                readiness = 0.15
            elif level_distance == -1:
                readiness = 0.35
            elif level_distance == 0:
                readiness = 0.85
            elif level_distance == 1:
                readiness = 1.0
            else:
                readiness = max(0.1, 0.45 / level_distance)

            confidence_gap = max(0.0, global_config.RECOMMENDATION_LOW_CONFIDENCE_THRESHOLD - profile.confidence)
            confidence_score = min(1.0, confidence_gap / global_config.RECOMMENDATION_LOW_CONFIDENCE_THRESHOLD)
            freshness_score = self._freshness_score(last_dates.get(skill_level_id))
            score_score = max(0.0, min(1.0, 1.0 - (profile.score / 100.0)))
            target_score = readiness * (0.45 * freshness_score + 0.35 * confidence_score + 0.2 * score_score)
            best_score = max(best_score, target_score)
        return best_score

    async def _load_skill_profiles(self, user_id: int) -> dict[int, SkillProfile]:
        skill_ids = await self._load_user_skill_ids(user_id)
        profiles: dict[int, SkillProfile] = {}
        for skill_id in skill_ids:
            profile = await self._compute_skill_profile(user_id, skill_id)
            if profile:
                profiles[skill_id] = profile
        return profiles

    async def _load_user_skill_ids(self, user_id: int) -> set[int]:
        repo_result = await self.db.execute(
            select(RepoSkill.skill_id)
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user_id, RepoSkill.skill_id.isnot(None))
            .distinct()
        )
        skill_ids = set(repo_result.scalars().all())

        test_result = await self.db.execute(
            select(SkillLevel.skill_id)
            .join(TestGroup, TestGroup.skill_level_id == SkillLevel.id)
            .join(Test, Test.test_group_id == TestGroup.id)
            .join(TestAttempt, TestAttempt.test_id == Test.id)
            .where(TestAttempt.user_id == user_id, TestAttempt.completed_at.isnot(None))
            .distinct()
        )
        skill_ids.update(test_result.scalars().all())

        task_result = await self.db.execute(
            select(SkillLevel.skill_id)
            .join(SkillLevelTask, SkillLevelTask.skill_level_id == SkillLevel.id)
            .join(TaskHistory, TaskHistory.task_id == SkillLevelTask.task_id)
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user_id, TaskHistory.completed_at.isnot(None))
            .distinct()
        )
        skill_ids.update(task_result.scalars().all())
        return skill_ids

    async def _compute_skill_profile(self, user_id: int, skill_id: int) -> SkillProfile | None:
        levels_result = await self.db.execute(
            select(SkillLevel.id, SkillLevel.order_index)
            .where(SkillLevel.skill_id == skill_id)
            .order_by(SkillLevel.order_index, SkillLevel.id)
        )
        levels = levels_result.all()
        if not levels:
            return None

        cutoff_date = self._now() - timedelta(days=global_config.SKILL_SCORE_DECAY_MAX_DAYS)
        repo_result = await self.db.execute(
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
            for score, analyzed_at in repo_result.all()
        ]
        score = sum(adjusted_scores) / len(adjusted_scores) if adjusted_scores else 0.0

        relations_result = await self.db.execute(
            select(SkillRelation.source_id, SkillRelation.influence_weight)
            .where(SkillRelation.target_id == skill_id)
        )
        relations = [(row.source_id, row.influence_weight) for row in relations_result.all()]
        if relations:
            source_ids = [source_id for source_id, _ in relations]
            src_scores_result = await self.db.execute(
                select(RepoSkill.skill_id, func.avg(RepoSkill.score).label("avg"))
                .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
                .where(
                    UserRepo.user_id == user_id,
                    RepoSkill.skill_id.in_(source_ids),
                    UserRepo.analyzed_at >= cutoff_date,
                )
                .group_by(RepoSkill.skill_id)
            )
            source_scores = {row.skill_id: float(row.avg) for row in src_scores_result.all()}
            score = min(100.0, score * calculate_vtotal(relations, source_scores, global_config.VTOTAL_EPSILON))

        level_index = get_level_index_normal(score, len(levels))
        selected_level = levels[level_index]
        confidence = calculate_confidence(score, len(levels), level_index)

        n = await self.db.scalar(
            select(func.count(RepoSkill.id))
            .join(UserRepo, RepoSkill.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user_id, RepoSkill.skill_id == skill_id)
        ) or 0
        sample_gap = (global_config.REPO_SKILL_COUNT_FOR_UPDATE / 2) - n
        if sample_gap > 0:
            confidence *= max(0.0, 1 - 0.1 * sample_gap)

        test_cutoff = self._now() - timedelta(days=global_config.DAYS_FOR_TEST_ATTEMPT * 2)
        test_attempt = await self.db.execute(
            select(TestAttempt.score, Test.threshold_score)
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(
                TestAttempt.user_id == user_id,
                TestGroup.skill_level_id == selected_level.id,
                TestAttempt.completed_at >= test_cutoff,
            )
            .order_by(TestAttempt.completed_at.desc())
            .limit(1)
        )
        row = test_attempt.first()
        if row:
            confidence *= (row.score or 0) / row.threshold_score if row.threshold_score else 1.0
        else:
            confidence *= 0.7

        return SkillProfile(
            skill_id=skill_id,
            current_skill_level_id=selected_level.id,
            current_order_index=selected_level.order_index,
            confidence=min(1.0, max(0.0, confidence)),
            score=score,
        )

    async def _load_missing_function_priorities(self, user_id: int) -> dict[int, float]:
        obtained_ids = await self._load_obtained_function_ids(user_id)
        if not obtained_ids:
            return {}

        group_rows = await self.db.execute(
            select(
                PsFunctionsGroup.id.label("group_id"),
                PsFunctionsGroup.ps_id,
                PsFunction.id.label("function_id"),
            )
            .join(PsFunction, PsFunction.ps_functions_group_id == PsFunctionsGroup.id)
            .order_by(PsFunctionsGroup.id, PsFunction.code)
        )

        functions_by_group: dict[int, list[int]] = {}
        ps_by_group: dict[int, int] = {}
        for row in group_rows.all():
            functions_by_group.setdefault(row.group_id, []).append(row.function_id)
            ps_by_group[row.group_id] = row.ps_id

        touched_groups_by_ps: dict[int, set[int]] = {}
        group_missing: dict[int, list[int]] = {}
        for group_id, function_ids in functions_by_group.items():
            obtained_in_group = [function_id for function_id in function_ids if function_id in obtained_ids]
            if not obtained_in_group:
                continue
            missing = [function_id for function_id in function_ids if function_id not in obtained_ids]
            if not missing:
                continue
            ps_id = ps_by_group[group_id]
            touched_groups_by_ps.setdefault(ps_id, set()).add(group_id)
            group_missing[group_id] = missing

        if not group_missing:
            return {}

        priorities: dict[int, float] = {}
        max_touched_groups = max((len(groups) for groups in touched_groups_by_ps.values()), default=1)
        max_group_size = max((len(functions) for functions in functions_by_group.values()), default=1)
        for group_id, missing in group_missing.items():
            ps_id = ps_by_group[group_id]
            ps_priority = len(touched_groups_by_ps.get(ps_id, set())) / max_touched_groups
            completion_priority = 1.0 - ((len(missing) - 1) / max_group_size)
            priority = max(0.0, min(1.0, 0.6 * completion_priority + 0.4 * ps_priority))
            for function_id in missing:
                priorities[function_id] = max(priorities.get(function_id, 0.0), priority)
        return priorities

    async def _load_obtained_function_ids(self, user_id: int) -> set[int]:
        passed_tests = (
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
        completed_tasks = (
            select(TaskPsFunction.ps_function_id)
            .join(TaskHistory, TaskPsFunction.task_id == TaskHistory.task_id)
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .where(
                UserRepo.user_id == user_id,
                TaskHistory.completed_at.isnot(None),
                ~failed_requirements_exist,
            )
        )

        result = await self.db.execute(passed_tests.union(completed_tasks))
        return {row[0] for row in result.all()}

    async def _load_last_test_dates(self, user_id: int) -> dict[int, datetime]:
        result = await self.db.execute(
            select(TestGroup.skill_level_id, func.max(TestAttempt.completed_at).label("completed_at"))
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(TestAttempt.user_id == user_id, TestAttempt.completed_at.isnot(None))
            .group_by(TestGroup.skill_level_id)
        )
        return {row.skill_level_id: row.completed_at for row in result.all() if row.completed_at}

    async def _load_last_task_dates(self, user_id: int) -> dict[int, datetime]:
        result = await self.db.execute(
            select(SkillLevelTask.skill_level_id, func.max(TaskHistory.completed_at).label("completed_at"))
            .join(TaskHistory, TaskHistory.task_id == SkillLevelTask.task_id)
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .where(UserRepo.user_id == user_id, TaskHistory.completed_at.isnot(None))
            .group_by(SkillLevelTask.skill_level_id)
        )
        return {row.skill_level_id: row.completed_at for row in result.all() if row.completed_at}

    async def _load_successful_task_ids(self, user_id: int) -> set[int]:
        failed_requirements_exist = exists().where(
            TaskHistoryFailedRequirement.task_history_id == TaskHistory.id
        ).correlate(TaskHistory)
        result = await self.db.execute(
            select(TaskHistory.task_id)
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .where(
                UserRepo.user_id == user_id,
                TaskHistory.completed_at.isnot(None),
                ~failed_requirements_exist,
            )
            .distinct()
        )
        return set(result.scalars().all())

    def _freshness_score(self, last_date: datetime | None) -> float:
        if last_date is None:
            return 1.0
        age_days = max(0, (self._now() - last_date).days)
        return min(1.0, age_days / max(1, global_config.RECOMMENDATION_STALE_ACTIVITY_DAYS))

    async def _enrich(self, items: list[StoredRecommendation]) -> list[RecommendationItem]:
        tasks = [item for item in items if item.content_type == "task"]
        tests = [item for item in items if item.content_type == "test"]
        enriched_by_id: dict[str, RecommendationItem] = {}

        if tasks:
            task_ids = [item.target_id for item in tasks]
            task_rows = await self.db.execute(
                select(Task.id, Task.title, Task.description)
                .where(Task.id.in_(task_ids), Task.is_published == True)
            )
            task_data = {row.id: row for row in task_rows.all()}
            skills = await self._load_task_skill_items(task_ids)
            functions = await self._load_task_function_items(task_ids)
            for item in tasks:
                row = task_data.get(item.target_id)
                if not row:
                    continue
                enriched_by_id[item.id] = RecommendationItem(
                    id=item.id,
                    content_type="task",
                    target_id=item.target_id,
                    score=item.score,
                    created_at=item.created_at,
                    expires_at=item.expires_at,
                    title=row.title,
                    description=row.description,
                    skill_levels=skills.get(item.target_id, []),
                    ps_functions=functions.get(item.target_id, []),
                )

        if tests:
            skill_level_ids = [item.target_id for item in tests]
            test_rows = await self.db.execute(
                select(
                    SkillLevel.id.label("skill_level_id"),
                    Skill.name.label("skill_name"),
                    Level.name.label("level_name"),
                    func.min(TestGroup.description).label("description"),
                )
                .select_from(SkillLevel)
                .join(Skill, SkillLevel.skill_id == Skill.id)
                .join(Level, SkillLevel.level_id == Level.id)
                .join(TestGroup, TestGroup.skill_level_id == SkillLevel.id)
                .join(Test, Test.test_group_id == TestGroup.id)
                .where(SkillLevel.id.in_(skill_level_ids), Test.is_published == True)
                .group_by(SkillLevel.id, Skill.name, Level.name)
            )
            test_data = {row.skill_level_id: row for row in test_rows.all()}
            functions = await self._load_test_function_items(skill_level_ids)
            for item in tests:
                row = test_data.get(item.target_id)
                if not row:
                    continue
                enriched_by_id[item.id] = RecommendationItem(
                    id=item.id,
                    content_type="test",
                    target_id=item.target_id,
                    score=item.score,
                    created_at=item.created_at,
                    expires_at=item.expires_at,
                    title=f"{row.skill_name} - {row.level_name}",
                    description=row.description,
                    skill_levels=[
                        RecommendationSkillLevelItem(
                            id=item.target_id,
                            skill_name=row.skill_name,
                            level_name=row.level_name,
                        )
                    ],
                    ps_functions=functions.get(item.target_id, []),
                )

        return [enriched_by_id[item.id] for item in items if item.id in enriched_by_id]

    async def _load_task_skill_items(self, task_ids: list[int]) -> dict[int, list[RecommendationSkillLevelItem]]:
        result = await self.db.execute(
            select(SkillLevelTask.task_id, SkillLevel.id, Skill.name.label("skill_name"), Level.name.label("level_name"))
            .join(SkillLevel, SkillLevelTask.skill_level_id == SkillLevel.id)
            .join(Skill, SkillLevel.skill_id == Skill.id)
            .join(Level, SkillLevel.level_id == Level.id)
            .where(SkillLevelTask.task_id.in_(task_ids))
            .order_by(SkillLevelTask.task_id, Skill.name, SkillLevel.order_index)
        )
        items: dict[int, list[RecommendationSkillLevelItem]] = {}
        for row in result.all():
            items.setdefault(row.task_id, []).append(
                RecommendationSkillLevelItem(id=row.id, skill_name=row.skill_name, level_name=row.level_name)
            )
        return items

    async def _load_task_function_items(self, task_ids: list[int]) -> dict[int, list[RecommendationPsFunctionItem]]:
        result = await self.db.execute(
            select(TaskPsFunction.task_id, PsFunction.id, PsFunction.code, PsFunction.name)
            .join(PsFunction, TaskPsFunction.ps_function_id == PsFunction.id)
            .where(TaskPsFunction.task_id.in_(task_ids))
            .order_by(TaskPsFunction.task_id, PsFunction.code)
        )
        items: dict[int, list[RecommendationPsFunctionItem]] = {}
        for row in result.all():
            items.setdefault(row.task_id, []).append(
                RecommendationPsFunctionItem(id=row.id, code=row.code, name=row.name)
            )
        return items

    async def _load_test_function_items(self, skill_level_ids: list[int]) -> dict[int, list[RecommendationPsFunctionItem]]:
        result = await self.db.execute(
            select(TestGroup.skill_level_id, PsFunction.id, PsFunction.code, PsFunction.name)
            .join(TestPsFunction, TestPsFunction.test_group_id == TestGroup.id)
            .join(PsFunction, TestPsFunction.ps_function_id == PsFunction.id)
            .where(TestGroup.skill_level_id.in_(skill_level_ids))
            .distinct()
            .order_by(TestGroup.skill_level_id, PsFunction.code)
        )
        items: dict[int, list[RecommendationPsFunctionItem]] = {}
        for row in result.all():
            items.setdefault(row.skill_level_id, []).append(
                RecommendationPsFunctionItem(id=row.id, code=row.code, name=row.name)
            )
        return items

    async def _store_candidate(self, user_id: int, candidate: CandidateRecommendation) -> None:
        now = self._now()
        expires_at = now + timedelta(days=global_config.RECOMMENDATION_TTL_DAYS)
        key = self._item_key(user_id, candidate.id)
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                key,
                mapping={
                    "content_type": candidate.content_type,
                    "target_id": str(candidate.target_id),
                    "score": str(candidate.score),
                    "status": "active",
                    "created_at": self._format_dt(now),
                    "expires_at": self._format_dt(expires_at),
                },
            )
            pipeline.expire(key, self._ttl_seconds())
            pipeline.zadd(self._items_key(user_id), {candidate.id: candidate.score})
            pipeline.expire(self._items_key(user_id), self._ttl_seconds() + 86400)
            await pipeline.execute()

    async def _delete_recommendation(self, user_id: int, recommendation_id: str) -> None:
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.delete(self._item_key(user_id, recommendation_id))
            pipeline.zrem(self._items_key(user_id), recommendation_id)
            await pipeline.execute()

    async def _cleanup_and_load(self, user_id: int) -> list[StoredRecommendation]:
        ids = await self.redis.zrange(self._items_key(user_id), 0, -1)
        if not ids:
            return []

        now = self._now()
        items: list[StoredRecommendation] = []
        stale_ids: list[str] = []
        for recommendation_id in ids:
            data = await self.redis.hgetall(self._item_key(user_id, recommendation_id))
            if not data:
                stale_ids.append(recommendation_id)
                continue
            try:
                expires_at = self._parse_dt(data["expires_at"])
                if expires_at <= now:
                    stale_ids.append(recommendation_id)
                    await self.redis.delete(self._item_key(user_id, recommendation_id))
                    continue
                items.append(StoredRecommendation(
                    id=recommendation_id,
                    content_type=data["content_type"],
                    target_id=int(data["target_id"]),
                    score=float(data["score"]),
                    status=data.get("status", "active"),
                    created_at=self._parse_dt(data["created_at"]),
                    expires_at=expires_at,
                ))
            except (KeyError, TypeError, ValueError):
                stale_ids.append(recommendation_id)

        if stale_ids:
            await self.redis.zrem(self._items_key(user_id), *stale_ids)
        return items

    async def _count_recent_skips(self, user_id: int) -> int:
        key = self._skips_key(user_id)
        cutoff = self._now().timestamp() - self._week_seconds()
        await self.redis.zremrangebyscore(key, "-inf", cutoff)
        return int(await self.redis.zcard(key))

    @classmethod
    async def mark_user_active(cls, user_id: int, redis: Redis | None = None) -> None:
        client = redis or get_redis()
        now = cls._now()
        await client.zadd(ACTIVE_USERS_KEY, {str(user_id): now.timestamp()})

    @classmethod
    async def load_recent_active_user_ids(cls, redis: Redis) -> list[int]:
        now = cls._now()
        cutoff = now - timedelta(days=global_config.RECOMMENDATION_ACTIVE_USER_DAYS)
        await redis.zremrangebyscore(ACTIVE_USERS_KEY, "-inf", cutoff.timestamp())
        user_ids = await redis.zrangebyscore(ACTIVE_USERS_KEY, cutoff.timestamp(), "+inf")
        return [int(user_id) for user_id in user_ids]

    @staticmethod
    def _items_key(user_id: int) -> str:
        return f"recommendations:user:{user_id}:items"

    @staticmethod
    def _item_key(user_id: int, recommendation_id: str) -> str:
        return f"recommendations:user:{user_id}:item:{recommendation_id}"

    @staticmethod
    def _skips_key(user_id: int) -> str:
        return f"recommendations:user:{user_id}:skips"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _format_dt(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat()

    @staticmethod
    def _parse_dt(value: str) -> datetime:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed

    @staticmethod
    def _ttl_seconds() -> int:
        return global_config.RECOMMENDATION_TTL_DAYS * 86400

    @staticmethod
    def _week_seconds() -> int:
        return 7 * 86400
