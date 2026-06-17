import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.models import ProfStandard, PsFunction, PsFunctionsGroup, Task
from src.models import TaskPsFunction, TaskRequirement


def test_task_requirements_are_deleted_with_task(db_session):
    task = Task(title="REST API task", description="Реализовать сервисный слой и обработчики API.", is_published=True)
    task.requirements = [
        TaskRequirement(description="Добавить обработчик"),
        TaskRequirement(description="Проверить ошибки"),
    ]

    db_session.add(task)
    db_session.commit()

    db_session.delete(task)
    db_session.commit()

    assert db_session.scalars(select(TaskRequirement)).all() == []


def test_task_ps_function_link_is_unique(db_session):
    standard = ProfStandard(
        code=8,
        name="ПС",
        functions_groups=[
            PsFunctionsGroup(
                code="B",
                name="ОТФ",
                qualification_level=5,
                functions=[PsFunction(code=1, name="ТФ")],
            )
        ],
    )
    task = Task(title="Unique TF task", description="Проверка уникальности.", is_published=True)
    db_session.add_all([standard, task])
    db_session.commit()

    function_id = standard.functions_groups[0].functions[0].id
    db_session.add_all([
        TaskPsFunction(task_id=task.id, ps_function_id=function_id),
        TaskPsFunction(task_id=task.id, ps_function_id=function_id),
    ])

    with pytest.raises(IntegrityError):
        db_session.commit()
