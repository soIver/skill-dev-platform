import pytest
from pydantic import ValidationError

from src.skills.schemas import SkillRelationUpdateItem
from src.tasks.schemas import TaskCreateUpdate, TaskRequirementCreateUpdate


def test_skill_relation_weight_boundaries():
    assert SkillRelationUpdateItem(
        skill_id=1,
        incoming_id=2,
        incoming_weight=0.1,
        outgoing_id=3,
        outgoing_weight=1.0,
    )

    with pytest.raises(ValidationError):
        SkillRelationUpdateItem(skill_id=1, incoming_id=2, incoming_weight=0.01)


def test_task_create_update_enforces_core_contract():
    requirements = [
        TaskRequirementCreateUpdate(description="Первое требование"),
        TaskRequirementCreateUpdate(description="Второе требование"),
    ]

    assert TaskCreateUpdate(
        title="API task",
        description="Описание задания достаточно длинное для проверки схемы. " * 2,
        is_published=True,
        skill_level_ids=[1, 2],
        requirements=requirements,
        ps_function_ids=list(range(10)),
    )

    with pytest.raises(ValidationError):
        TaskCreateUpdate(
            title="Bad",
            description="short",
            is_published=True,
            skill_level_ids=[],
            requirements=requirements,
            ps_function_ids=list(range(11)),
        )
