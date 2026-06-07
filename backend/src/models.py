from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Float, String, Text, Date, func
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, relationship
from pgvector.sqlalchemy import Vector


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
    github_id = Column(BigInteger, unique=True, nullable=True)
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
    task_id = Column(
        Integer,
        ForeignKey("tasks.id"),
        nullable=True,
    )
    gh_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", lazy="select")


class RepoSkill(Base):
    __tablename__ = "repo_skills"

    id = Column(Integer, primary_key=True)
    repo_id = Column(
        Integer,
        ForeignKey("user_repos.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_id = Column(
        Integer,
        ForeignKey("skills.id"),
        nullable=True,
    )
    score = Column(Integer, nullable=False)

    user_repo = relationship("UserRepo", lazy="select")
    skill = relationship("Skill", lazy="select")


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    embedding = Column(Vector(384), nullable=True)


class SkillRelation(Base):
    __tablename__ = "skill_relations"

    id = Column(Integer, primary_key=True)
    source_id = Column(
        Integer,
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_id = Column(
        Integer,
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
    )
    influence_weight = Column(Float, default=0.5, nullable=False)


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
    description = Column(Text, nullable=False, server_default="")
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


class TestAttempt(Base):
    __tablename__ = "test_attempts"

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


class VacancySkillLevel(Base):
    __tablename__ = "vacancy_skill_levels"

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


class VacancyHistory(Base):
    __tablename__ = "vacancy_history"

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
    viewed_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", lazy="select")
    vacancy = relationship("Vacancy", lazy="select")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    title = Column(String(48), unique=True, nullable=False)
    description = Column(Text, nullable=False)
    is_published = Column(Boolean, default=False)
    author_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    author = relationship("User", lazy="select")
    skill_level_tasks = relationship("SkillLevelTask", back_populates="task", cascade="all, delete-orphan")


class TaskScore(Base):
    __tablename__ = "task_scores"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
    )

    score = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", lazy="select")
    task = relationship("Task", lazy="select")


class SkillLevelTask(Base):
    __tablename__ = "skill_level_tasks"

    id = Column(Integer, primary_key=True)
    skill_level_id = Column(
        Integer,
        ForeignKey("skill_levels.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )

    skill_level = relationship("SkillLevel", lazy="select")
    task = relationship("Task", back_populates="skill_level_tasks")


class UserRecommendation(Base):
    __tablename__ = "user_recommendations"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
    )
    test_id = Column(
        Integer,
        ForeignKey("tests.id", ondelete="CASCADE"),
        nullable=True,
    )
    vacancy_id = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=True,
    )
    repo_id = Column(
        Integer,
        ForeignKey("user_repos.id", ondelete="CASCADE"),
        nullable=True,
    )

    completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", lazy="select")
    task = relationship("Task", lazy="select")
    test = relationship("Test", lazy="select")
    vacancy = relationship("Vacancy", lazy="select")


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
