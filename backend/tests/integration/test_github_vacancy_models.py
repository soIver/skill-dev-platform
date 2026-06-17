import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.models import GitHubProfile, Role, Skill, User, Vacancy
from src.models import VacancyHistory, VacancySkill


def test_github_profile_uses_github_id_and_unique_user(db_session):
    user = User(username="user_one", email="one@example.com", password_hash="hash", role=Role(name="user"))
    db_session.add(GitHubProfile(id=123456789, user=user, github_token="encrypted"))
    db_session.commit()

    db_session.add(GitHubProfile(id=987654321, user_id=user.id, github_token="other"))

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_vacancy_history_and_skills_link_entities(db_session):
    user = User(username="vacancy_user", email="vacancy@example.com", password_hash="hash", role=Role(name="user"))
    skill = Skill(name="Docker")
    vacancy = Vacancy(id=100, title="DevOps engineer", url="https://hh.ru/vacancy/100")
    db_session.add_all([
        VacancySkill(vacancy=vacancy, skill=skill, score=80),
        VacancyHistory(user=user, vacancy=vacancy),
    ])
    db_session.commit()

    persisted = db_session.scalar(select(VacancySkill).where(VacancySkill.vacancy_id == 100))

    assert persisted.skill.name == "Docker"
    assert persisted.score == 80
    assert db_session.scalar(select(VacancyHistory)).user.email == "vacancy@example.com"
