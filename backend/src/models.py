from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Float, String, Text, Date, func, UniqueConstraint
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
    role_id = Column(
        Integer,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
    )

    role = relationship("Role", lazy="select")


class ProfStandard(Base):
    __tablename__ = "prof_standards"

    id = Column(Integer, primary_key=True)
    code = Column(Integer, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    functions_groups = relationship("PsFunctionsGroup", back_populates="prof_standard", cascade="all, delete-orphan")


class PsFunctionsGroup(Base):
    __tablename__ = "ps_functions_groups"
    __table_args__ = (
        UniqueConstraint("ps_id", "code", name="uq_ps_functions_groups_ps_code"),
    )

    id = Column(Integer, primary_key=True)
    ps_id = Column(
        Integer,
        ForeignKey("prof_standards.id", ondelete="CASCADE"),
        nullable=False,
    )
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    qualification_level = Column(Integer, nullable=False, default=1, server_default="1")

    prof_standard = relationship("ProfStandard", back_populates="functions_groups", lazy="select")
    functions = relationship("PsFunction", back_populates="functions_group", cascade="all, delete-orphan")


class PsFunction(Base):
    __tablename__ = "ps_functions"
    __table_args__ = (
        UniqueConstraint("ps_functions_group_id", "code", name="uq_ps_functions_group_code"),
    )

    id = Column(Integer, primary_key=True)
    ps_functions_group_id = Column(
        Integer,
        ForeignKey("ps_functions_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    code = Column(Integer, nullable=False)
    name = Column(String, nullable=False)

    functions_group = relationship("PsFunctionsGroup", back_populates="functions", lazy="select")


class GitHubProfile(Base):
    __tablename__ = "github_profiles"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    github_token = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", lazy="select")


class GitHubRepo(Base):
    __tablename__ = "github_repos"

    id = Column(Integer, primary_key=True)
    gh_id = Column(BigInteger, unique=True, nullable=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserRepo(Base):
    __tablename__ = "user_repos"
    __table_args__ = (
        UniqueConstraint("user_id", "repo_id", name="uq_user_repos_user_repo"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    repo_id = Column(
        Integer,
        ForeignKey("github_repos.id", ondelete="CASCADE"),
        nullable=False,
    )
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", lazy="select")
    repo = relationship("GitHubRepo", lazy="select")


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

    id = Column(Integer, primary_key=True) # hh id
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)


class VacancySkill(Base):
    __tablename__ = "vacancy_skills"

    id = Column(Integer, primary_key=True)
    vacancy_id = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_id = Column(
        Integer,
        ForeignKey("skills.id"),
        nullable=True,
    )

    vacancy = relationship("Vacancy", lazy="select")
    skill_level = relationship("Skill", lazy="select")


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


class TaskHistory(Base):
    __tablename__ = "task_history"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    repo_id = Column(
        Integer,
        ForeignKey("user_repos.id", ondelete="CASCADE"),
        nullable=False,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)
    successful = Column(Boolean, default=False, nullable=False)

    user = relationship("User", lazy="select")
    task = relationship("Task", lazy="select")
    repo = relationship("UserRepo", lazy="select")


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
