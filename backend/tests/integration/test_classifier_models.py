import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.models import ProfStandard, PsFunction, PsFunctionsGroup


def test_prof_standard_hierarchy_persists(db_session):
    standard = ProfStandard(
        code=6,
        name="ИТ",
        functions_groups=[
            PsFunctionsGroup(
                code="A",
                name="Проектирование ПО",
                qualification_level=6,
                functions=[
                    PsFunction(code=1, name="Архитектура"),
                    PsFunction(code=2, name="Интерфейсы"),
                ],
            )
        ],
    )

    db_session.add(standard)
    db_session.commit()

    persisted = db_session.scalar(select(ProfStandard).where(ProfStandard.code == 6))

    assert persisted.functions_groups[0].qualification_level == 6
    assert [item.name for item in persisted.functions_groups[0].functions] == [
        "Архитектура",
        "Интерфейсы",
    ]


def test_group_code_is_unique_inside_standard(db_session):
    db_session.add(ProfStandard(
        code=7,
        name="ПС",
        functions_groups=[
            PsFunctionsGroup(code="A", name="Первая", qualification_level=5),
            PsFunctionsGroup(code="A", name="Вторая", qualification_level=6),
        ],
    ))

    with pytest.raises(IntegrityError):
        db_session.commit()
