import os
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()


class Config:
    # данные
    DATA_PATH = os.getenv("DATA_PATH", "./data")
    DEFAULT_LOGGER_LEVEL = os.getenv("DEFAULT_LOGGER_LEVEL", "DEBUG")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/skill_dev",
    )
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    CELERY_TIMEZONE = os.getenv("CELERY_TIMEZONE", "Europe/Moscow")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

    UTC3 = timezone(timedelta(hours=3))

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "secret")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "5")
    )
    JWT_REFRESH_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("JWT_REFRESH_TOKEN_EXPIRE_MINUTES", "10080")
    )

    # CORS
    ALLOWED_ORIGINS = os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173"
    ).split(",")
    RATE_LIMIT_RPM = 100 # запросов в минуту

    @classmethod
    def validate(cls):
        if not all((cls.DATABASE_URL, cls.REDIS_URL, cls.JWT_SECRET_KEY, cls.ADMIN_EMAIL)):
            print("Переменные среды требуют проверки")
            return False
        return True


global_config = Config()
