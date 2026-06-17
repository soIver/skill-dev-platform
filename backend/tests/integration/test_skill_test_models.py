from sqlalchemy import select

from src.models import Level, QuestionAnswer, Skill, SkillLevel
from src.models import Test as ModelTest
from src.models import TestGroup as ModelTestGroup
from src.models import TestQuestion as ModelTestQuestion


def test_skill_level_links_skill_and_level(db_session):
    skill_level = SkillLevel(skill=Skill(name="Python"), level=Level(name="Junior"), order_index=0)

    db_session.add(skill_level)
    db_session.commit()

    persisted = db_session.scalar(select(SkillLevel))

    assert persisted.skill.name == "Python"
    assert persisted.level.name == "Junior"


def test_test_group_questions_and_answers_persist(db_session):
    group = ModelTestGroup(
        skill_level=SkillLevel(skill=Skill(name="SQL"), level=Level(name="Middle"), order_index=1),
        description="Проверка SQL.",
        tests=[ModelTest(time_limit_minutes=15, threshold_score=2, is_published=True)],
    )
    db_session.add(group)
    db_session.commit()

    question = ModelTestQuestion(test_id=group.tests[0].id, question_text="Какой оператор фильтрует строки в SQL?", order_index=1, points=2)
    db_session.add(question)
    db_session.flush()
    db_session.add_all([
        QuestionAnswer(question_id=question.id, answer_text="WHERE", is_correct=True, order_index=1),
        QuestionAnswer(question_id=question.id, answer_text="ORDER BY", is_correct=False, order_index=2),
    ])
    db_session.commit()

    answers = db_session.scalars(select(QuestionAnswer).order_by(QuestionAnswer.order_index)).all()

    assert [answer.answer_text for answer in answers] == ["WHERE", "ORDER BY"]
    assert answers[0].is_correct is True
