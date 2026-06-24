from src.models import Level, Skill, SkillLevel, SkillLevelTask, Task, Test as DbTest, TestGroup as DbTestGroup
from src.recommendations.service import RecommendationService


def _add_level(db_session, skill, level_name, order_index):
    level = Level(name=level_name)
    skill_level = SkillLevel(skill=skill, level=level, order_index=order_index)
    db_session.add_all([level, skill_level])
    db_session.flush()
    return skill_level


def _add_test(db_session, skill_level):
    group = DbTestGroup(skill_level_id=skill_level.id, description="Описание теста для рекомендации")
    test = DbTest(test_group=group, is_published=True)
    db_session.add_all([group, test])


def _add_task(db_session, skill_level, title):
    task = Task(title=title, description="Описание задания", is_published=True)
    task.skill_level_tasks.append(SkillLevelTask(skill_level_id=skill_level.id))
    db_session.add(task)
    db_session.flush()
    return task


def _select_candidate(db_session, skill_id, min_order_index, required_order_index, completed=None):
    query = RecommendationService._gap_candidate_query(
        skill_id=skill_id,
        min_order_index=min_order_index,
        required_order_index=required_order_index,
        completed_task_ids=completed or set(),
        used_ids=set(),
    )
    return db_session.execute(query).first()


def test_gap_candidate_prefers_content_in_target_range_over_fallback(db_session):
    skill = Skill(name="Навык с целевым заданием")
    db_session.add(skill)
    low_level = _add_level(db_session, skill, "Низкий уровень", 1)
    target_level = _add_level(db_session, skill, "Целевой уровень", 3)
    _add_test(db_session, low_level)
    target_task = _add_task(db_session, target_level, "Целевое задание")
    db_session.flush()

    row = _select_candidate(db_session, skill.id, 3, 4)

    assert row.content_type == "task"
    assert row.target_id == target_task.id


def test_gap_candidate_falls_back_to_highest_available_level(db_session):
    skill = Skill(name="Навык с резервным контентом")
    db_session.add(skill)
    low_level = _add_level(db_session, skill, "Резервный низкий", 1)
    high_level = _add_level(db_session, skill, "Резервный высокий", 2)
    _add_test(db_session, low_level)
    high_task = _add_task(db_session, high_level, "Резервное задание")
    db_session.flush()

    row = _select_candidate(db_session, skill.id, 3, 4)

    assert row.content_type == "task"
    assert row.target_id == high_task.id


def test_gap_candidate_prefers_test_when_fallback_levels_are_equal(db_session):
    skill = Skill(name="Навык с равным резервным уровнем")
    db_session.add(skill)
    fallback_level = _add_level(db_session, skill, "Одинаковый резервный", 2)
    _add_test(db_session, fallback_level)
    _add_task(db_session, fallback_level, "Равное резервное задание")
    db_session.flush()

    row = _select_candidate(db_session, skill.id, 3, 4)

    assert row.content_type == "test"
    assert row.target_id == fallback_level.id


def test_gap_candidate_excludes_completed_tasks_from_fallback(db_session):
    skill = Skill(name="Навык с выполненным заданием")
    db_session.add(skill)
    task_level = _add_level(db_session, skill, "Выполненный резервный", 2)
    test_level = _add_level(db_session, skill, "Доступный резервный", 1)
    completed_task = _add_task(db_session, task_level, "Выполненное задание")
    _add_test(db_session, test_level)
    db_session.flush()

    row = _select_candidate(db_session, skill.id, 3, 4, completed={completed_task.id})

    assert row.content_type == "test"
    assert row.target_id == test_level.id
