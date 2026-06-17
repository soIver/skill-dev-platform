from sqlalchemy import select

from src.models import GitHubRepo, Role, Task, TaskHistory
from src.models import TaskHistoryFailedRequirement, TaskRequirement, User, UserRepo


def test_task_history_failed_requirements_are_deleted_with_history(db_session):
    user = User(
        username="repo_user",
        email="repo@example.com",
        password_hash="hash",
        role=Role(name="user"),
    )
    repo = GitHubRepo(gh_id=1, name="repo", url="https://github.com/example/repo")
    user_repo = UserRepo(user=user, repo=repo)
    task = Task(
        title="History task",
        description="Проверка истории выполнения задания.",
        is_published=True,
        requirements=[
            TaskRequirement(description="Первое требование"),
            TaskRequirement(description="Второе требование"),
        ],
    )
    db_session.add_all([user_repo, task])
    db_session.commit()

    history = TaskHistory(task_id=task.id, repo_id=user_repo.id)
    db_session.add(history)
    db_session.flush()
    db_session.add(TaskHistoryFailedRequirement(
        task_history_id=history.id,
        task_requirement_id=task.requirements[0].id,
    ))
    db_session.commit()

    db_session.delete(history)
    db_session.commit()

    assert db_session.scalars(select(TaskHistoryFailedRequirement)).all() == []
