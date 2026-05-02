from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, Date, func
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    github_token = Column(String, nullable=True)
    role_id = Column(
        Integer,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
    )

    role = relationship("Role", lazy="select")


class CodeType(Base):
    __tablename__ = "code_types"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)


class UserRepo(Base):
    __tablename__ = "user_repos"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    gh_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", lazy="select")


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)


class Level(Base):
    __tablename__ = "levels"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)


class SkillLevel(Base):
    __tablename__ = "skill_levels"

    id = Column(Integer, primary_key=True)
    skill_id = Column(
        Integer,
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
    )
    level_id = Column(
        Integer,
        ForeignKey("levels.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index = Column(Integer, nullable=False)
    author_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    skill = relationship("Skill", lazy="select")
    level = relationship("Level", lazy="select")
    author = relationship("User", lazy="select")


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True)
    skill_level_id = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )
    time_limit_minutes = Column(Integer, nullable=True)
    threshold_score = Column(Integer, nullable=True)
    is_published = Column(Boolean, default=False)
    author_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    skill_level = relationship("SkillLevel", lazy="select")
    author = relationship("User", lazy="select")


class TestQuestion(Base):
    __tablename__ = "test_questions"

    id = Column(Integer, primary_key=True)
    test_id = Column(
        Integer,
        ForeignKey("tests.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_text = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False)
    points = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test = relationship("Test", lazy="select")


class QuestionAnswer(Base):
    __tablename__ = "question_answers"

    id = Column(Integer, primary_key=True)
    question_id = Column(
        Integer,
        ForeignKey("test_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    answer_text = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    question = relationship("TestQuestion", lazy="select")


class UserTestAttempt(Base):
    __tablename__ = "user_test_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    test_id = Column(
        Integer,
        ForeignKey("tests.id"),
        nullable=True,
    )
    score = Column(Integer, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", lazy="select")
    test = relationship("Test", lazy="select")


class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_level_id = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )
    obtained_date = Column(Date, server_default=func.current_date())
    repeated_date = Column(Date, nullable=True)

    user = relationship("User", lazy="select")
    skill_level = relationship("SkillLevel", lazy="select")


class Vacancy(Base):
    __tablename__ = "vacancies"

    id = Column(Integer, primary_key=True)
    hh_id = Column(String, unique=True, nullable=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=True)
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    exp_years_min = Column(Integer, nullable=True)
    url = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)


class Keyword(Base):
    __tablename__ = "keywords"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)


class VacancyKeyword(Base):
    __tablename__ = "vacancy_keywords"

    id = Column(Integer, primary_key=True)
    vacancy_id = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )
    keyword_id = Column(
        Integer,
        ForeignKey("keywords.id", ondelete="CASCADE"),
        nullable=False,
    )

    vacancy = relationship("Vacancy", lazy="select")
    keyword = relationship("Keyword", lazy="select")


class VacancySkill(Base):
    __tablename__ = "vacancy_skills"

    id = Column(Integer, primary_key=True)
    vacancy_id = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_level_id = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )

    vacancy = relationship("Vacancy", lazy="select")
    skill_level = relationship("SkillLevel", lazy="select")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True)
    description = Column(Text, nullable=True)
    check_repo = Column(Boolean, default=False)
    is_published = Column(Boolean, default=False)
    author_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    author = relationship("User", lazy="select")


class SkillRecommendation(Base):
    __tablename__ = "skill_recommendations"

    id = Column(Integer, primary_key=True)
    skill_level_id = Column(
        Integer,
        ForeignKey("skill_levels.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommendation_id = Column(
        Integer,
        ForeignKey("recommendations.id", ondelete="CASCADE"),
        nullable=False,
    )

    skill_level = relationship("SkillLevel", lazy="select")
    recommendation = relationship("Recommendation", lazy="select")


class UserRecommendation(Base):
    __tablename__ = "user_recommendations"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommendation_id = Column(
        Integer,
        ForeignKey("recommendations.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating = Column(Integer, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", lazy="select")
    recommendation = relationship("Recommendation", lazy="select")


class UserVacancy(Base):
    __tablename__ = "user_vacancies"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vacancy_id = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )

    user = relationship("User", lazy="select")
    vacancy = relationship("Vacancy", lazy="select")
