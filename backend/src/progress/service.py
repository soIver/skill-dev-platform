from datetime import datetime
from math import ceil

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    ProgressActivityItem,
    ProgressActivityListResponse,
    ProgressActivitySkillLevelItem,
)
from ..models import (
    GitHubRepo,
    Level,
    Skill,
    SkillLevel,
    Task,
    TaskHistory,
    TaskHistoryFailedRequirement,
    Test,
    TestAttempt,
    TestGroup,
    TestQuestion,
    UserRepo,
    Vacancy,
    VacancyHistory,
)


class ProgressActivityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_actions(self, user_id: int, page: int, limit: int) -> ProgressActivityListResponse:
        offset = (page - 1) * limit
        fetch_limit = page * limit

        test_count = await self.db.scalar(
            select(func.count(TestAttempt.id))
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .where(
                TestAttempt.user_id == user_id,
                TestAttempt.completed_at.isnot(None),
            )
        ) or 0
        task_count = await self.db.scalar(
            select(func.count(TaskHistory.id))
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .where(
                UserRepo.user_id == user_id,
                TaskHistory.completed_at.isnot(None),
            )
        ) or 0
        vacancy_count = await self.db.scalar(
            select(func.count(VacancyHistory.id))
            .where(VacancyHistory.user_id == user_id)
        ) or 0

        items = await self._load_test_actions(user_id, fetch_limit)
        items.extend(await self._load_task_actions(user_id, fetch_limit))
        items.extend(await self._load_vacancy_actions(user_id, fetch_limit))

        items.sort(key=lambda item: self._timestamp(item.occurred_at), reverse=True)
        total_items = test_count + task_count + vacancy_count
        total_pages = ceil(total_items / limit) if total_items else 1

        return ProgressActivityListResponse(
            items=items[offset:offset + limit],
            total_pages=total_pages,
            current_page=page,
        )

    async def _load_test_actions(self, user_id: int, limit: int) -> list[ProgressActivityItem]:
        total_score_sq = (
            select(func.coalesce(func.sum(TestQuestion.points), 0))
            .where(TestQuestion.test_id == Test.id)
            .correlate(Test)
            .scalar_subquery()
        )
        result = await self.db.execute(
            select(
                TestAttempt.id,
                TestAttempt.score,
                TestAttempt.completed_at,
                Test.id.label("test_id"),
                Test.threshold_score,
                TestGroup.skill_level_id,
                Skill.name.label("skill_name"),
                Level.name.label("level_name"),
                total_score_sq.label("total_score"),
            )
            .join(Test, TestAttempt.test_id == Test.id)
            .join(TestGroup, Test.test_group_id == TestGroup.id)
            .join(SkillLevel, TestGroup.skill_level_id == SkillLevel.id)
            .join(Skill, SkillLevel.skill_id == Skill.id)
            .join(Level, SkillLevel.level_id == Level.id)
            .where(
                TestAttempt.user_id == user_id,
                TestAttempt.completed_at.isnot(None),
            )
            .order_by(TestAttempt.completed_at.desc(), TestAttempt.id.desc())
            .limit(limit)
        )

        actions: list[ProgressActivityItem] = []
        for row in result.all():
            score = row.score or 0
            total_score = row.total_score or 0
            threshold_score = row.threshold_score or 0
            successful = threshold_score > 0 and score >= threshold_score
            title = f"{row.skill_name} - {row.level_name}"

            actions.append(ProgressActivityItem(
                id=f"test:{row.id}",
                content_type="test",
                target_id=row.skill_level_id,
                title=title,
                action_text="Завершена попытка теста",
                description=f"Результат: {score} из {total_score} баллов.",
                occurred_at=row.completed_at,
                successful=successful,
                skill_level=ProgressActivitySkillLevelItem(
                    id=row.skill_level_id,
                    skill_name=row.skill_name,
                    level_name=row.level_name,
                ),
            ))
        return actions

    async def _load_task_actions(self, user_id: int, limit: int) -> list[ProgressActivityItem]:
        failed_count_sq = (
            select(func.count(TaskHistoryFailedRequirement.id))
            .where(TaskHistoryFailedRequirement.task_history_id == TaskHistory.id)
            .correlate(TaskHistory)
            .scalar_subquery()
        )
        result = await self.db.execute(
            select(
                TaskHistory.id,
                TaskHistory.task_id,
                TaskHistory.completed_at,
                Task.title,
                GitHubRepo.name.label("repo_name"),
                failed_count_sq.label("failed_count"),
            )
            .join(UserRepo, TaskHistory.repo_id == UserRepo.id)
            .join(Task, TaskHistory.task_id == Task.id)
            .join(GitHubRepo, UserRepo.repo_id == GitHubRepo.id)
            .where(
                UserRepo.user_id == user_id,
                TaskHistory.completed_at.isnot(None),
            )
            .order_by(TaskHistory.completed_at.desc(), TaskHistory.id.desc())
            .limit(limit)
        )

        actions: list[ProgressActivityItem] = []
        for row in result.all():
            successful = (row.failed_count or 0) == 0
            actions.append(ProgressActivityItem(
                id=f"task:{row.id}",
                content_type="task",
                target_id=row.task_id,
                title=row.title,
                action_text="Проверено практическое задание",
                description=f"Репозиторий: {row.repo_name}.",
                occurred_at=row.completed_at,
                successful=successful,
            ))
        return actions

    async def _load_vacancy_actions(self, user_id: int, limit: int) -> list[ProgressActivityItem]:
        result = await self.db.execute(
            select(
                VacancyHistory.id,
                VacancyHistory.viewed_at,
                Vacancy.id.label("vacancy_id"),
                Vacancy.title,
                Vacancy.analyzed_at,
            )
            .join(Vacancy, VacancyHistory.vacancy_id == Vacancy.id)
            .where(VacancyHistory.user_id == user_id)
            .order_by(VacancyHistory.viewed_at.desc(), VacancyHistory.id.desc())
            .limit(limit)
        )

        actions: list[ProgressActivityItem] = []
        for row in result.all():
            actions.append(ProgressActivityItem(
                id=f"vacancy:{row.id}",
                content_type="vacancy",
                target_id=row.vacancy_id,
                title=row.title,
                action_text="Просмотрена вакансия",
                description=None,
                occurred_at=row.viewed_at,
                successful=None,
            ))
        return actions

    @staticmethod
    def _timestamp(value: datetime | None) -> float:
        return value.timestamp() if value else 0
