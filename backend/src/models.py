from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Numeric,
    Date,
    func,
    text,
)
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
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    github_token = Column(String, nullable=True)
    github_username = Column(String, unique=True, nullable=True)
    role = Column(
        Integer,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
    )

    role_rel = relationship("Role", lazy="select")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    jti = Column(String(36), unique=True, index=True, nullable=False)
    device_id = Column(String(255), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

class CodeType(Base):
    __tablename__ = "code_types"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    type = Column(
        Integer,
        ForeignKey("code_types.id"),
        nullable=False,
    )
    code = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserRepo(Base):
    __tablename__ = "user_repos"

    id = Column(Integer, primary_key=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    gh_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

class Level(Base):
    __tablename__ = "levels"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

class ContentStatus(Base):
    __tablename__ = "content_status"

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
    status = Column(
        Integer,
        ForeignKey("content_status.id"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True)
    skill_level = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )
    time_limit_minutes = Column(Integer, nullable=True)
    threshold_score = Column(Integer, nullable=True)
    status = Column(
        Integer,
        ForeignKey("content_status.id"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

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

class UserTestAttempt(Base):
    __tablename__ = "user_test_attempts"

    id = Column(Integer, primary_key=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    test = Column(
        Integer,
        ForeignKey("tests.id"),
        nullable=True,
    )
    score = Column(Integer, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="in_progress")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_level = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )
    obtained_date = Column(Date, server_default=func.current_date())
    repeated_date = Column(Date, nullable=True)

class Vacancy(Base):
    __tablename__ = "vacancies"

    id = Column(Integer, primary_key=True)
    hh_id = Column(String, unique=True, nullable=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=True)
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    experience = Column(String, nullable=True)
    keywords = Column(String, nullable=True)
    url = Column(String, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

class VacancySkill(Base):
    __tablename__ = "vacancy_skills"

    id = Column(Integer, primary_key=True)
    vacancy = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_level = Column(
        Integer,
        ForeignKey("skill_levels.id"),
        nullable=True,
    )

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True)
    description = Column(Text, nullable=True)
    check_repo = Column(Boolean, default=False)
    avg_rating = Column(Numeric(3, 2), nullable=True)
    shown_times = Column(Integer, default=0)
    status = Column(
        Integer,
        ForeignKey("content_status.id"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class SkillRecommendation(Base):
    __tablename__ = "skill_recommendations"

    id = Column(Integer, primary_key=True)
    skill_level = Column(
        Integer,
        ForeignKey("skill_levels.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommendation = Column(
        Integer,
        ForeignKey("recommendations.id", ondelete="CASCADE"),
        nullable=False,
    )

class UserRecommendation(Base):
    __tablename__ = "user_recommendations"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommendation = Column(
        Integer,
        ForeignKey("recommendations.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating = Column(Integer, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserVacancy(Base):
    __tablename__ = "user_vacancies"

    id = Column(Integer, primary_key=True)
    user = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vacancy = Column(
        Integer,
        ForeignKey("vacancies.id", ondelete="CASCADE"),
        nullable=False,
    )

