import os
import base64
import hashlib
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()


class Config:
    # данные
    DATA_PATH = "./data"
    DEFAULT_LOGGER_LEVEL = os.getenv("DEFAULT_LOGGER_LEVEL", "DEBUG")
    REDIS_URL = os.getenv("REDIS_URL")
    DATABASE_URL = os.getenv("DATABASE_URL")
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

    UTC3 = timezone(timedelta(hours=3))

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "secret")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 5
    JWT_REFRESH_TOKEN_EXPIRE_MINUTES = 10080
    AUTH_ACCESS_COOKIE_NAME = "access_token"
    AUTH_REFRESH_COOKIE_NAME = "refresh_token"
    AUTH_ACCESS_COOKIE_PATH = "/api"
    AUTH_REFRESH_COOKIE_PATH = "/api/auth"
    AUTH_COOKIE_HTTPONLY = True

    # GitHub OAuth
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI = os.getenv(
        "GITHUB_REDIRECT_URI",
        "http://localhost:8000/api/github/callback",
    )
    GITHUB_FRONTEND_REDIRECT_URL = os.getenv(
        "GITHUB_FRONTEND_REDIRECT_URL",
        "http://localhost:5173/profile/credentials",
    )
    GITHUB_SCOPE = "read:user"
    GITHUB_OAUTH_STATE_TTL_SECONDS = 600

    GITHUB_API_VERSION = "2026-03-10"
    GITHUB_TOKEN_ENCRYPTION_SECRET = os.getenv(
        "GITHUB_TOKEN_ENCRYPTION_SECRET",
        JWT_SECRET_KEY,
    )

    # CORS
    ALLOWED_ORIGINS = os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173"
    ).split(",")
    RATE_LIMIT_RPM = 100 # запросов в минуту

    @classmethod
    def github_token_encryption_key(cls) -> bytes:
        digest = hashlib.sha256(cls.GITHUB_TOKEN_ENCRYPTION_SECRET.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    @classmethod
    def auth_cookie_secure(cls) -> bool:
        return any(
            origin.strip().startswith("https://")
            for origin in cls.ALLOWED_ORIGINS
            if origin.strip()
        )

    @classmethod
    def validate(cls):
        if not all((cls.DATABASE_URL, cls.REDIS_URL, cls.JWT_SECRET_KEY, cls.ADMIN_EMAIL)):
            print("Переменные среды требуют проверки")
            return False
        return True


global_config = Config()
