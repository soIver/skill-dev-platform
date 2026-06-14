import os
import base64
import hashlib
from pathlib import Path
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
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 5
    JWT_REFRESH_TOKEN_EXPIRE_MINUTES = 10080
    AUTH_ACCESS_COOKIE_NAME = "access_token"
    AUTH_REFRESH_COOKIE_NAME = "refresh_token"
    AUTH_ACCESS_COOKIE_PATH = "/api"
    AUTH_REFRESH_COOKIE_PATH = "/api/auth"
    AUTH_COOKIE_HTTPONLY = True

    # приложение
    PUBLIC_SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://it-skill-dev.ru")
    FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

    # GitHub OAuth
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI = os.getenv(
        "GITHUB_REDIRECT_URI",
        "http://localhost:8000/api/github/callback",
    )
    GITHUB_FRONTEND_REDIRECT_URL = os.getenv(
        "GITHUB_FRONTEND_REDIRECT_URL",
        "http://localhost:5173/me/credentials",
    )
    GITHUB_SCOPE = "read:user user:email"
    GITHUB_OAUTH_STATE_TTL_SECONDS = 600

    GITHUB_API_VERSION = "2026-03-10"
    STRING_ENCRYPTION_ALGORITHM = os.getenv("STRING_ENCRYPTION_ALGORITHM", "fernet")
    STRING_ENCRYPTION_SECRET = os.getenv("STRING_ENCRYPTION_SECRET")
    PASSWORD_HASH_SCHEMES = tuple(
        scheme.strip()
        for scheme in os.getenv("PASSWORD_HASH_SCHEMES", "argon2").split(",")
        if scheme
    )

    # CORS
    ALLOWED_ORIGINS = os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173"
    ).split(",")

    # лимиты
    RATE_LIMIT_RPM = 30 # запросов в минуту
    DAYS_FOR_TEST_ATTEMPT = 7 # количество дней перед новой попыткой сдать тест
    DAYS_FOR_EMAIL_CHANGE = 30 # количество дней перед новой попыткой сменить почту

    # рекомендации
    RECOMMENDATION_TTL_DAYS = int(os.getenv("RECOMMENDATION_TTL_DAYS", "7"))
    RECOMMENDATION_ACTIVE_USER_DAYS = int(os.getenv("RECOMMENDATION_ACTIVE_USER_DAYS", "7"))
    RECOMMENDATION_MAX_ACTIVE = int(os.getenv("RECOMMENDATION_MAX_ACTIVE", "7"))
    RECOMMENDATION_SKIP_LIMIT_PER_WEEK = int(os.getenv("RECOMMENDATION_SKIP_LIMIT_PER_WEEK", "5"))
    RECOMMENDATION_STALE_ACTIVITY_DAYS = int(os.getenv("RECOMMENDATION_STALE_ACTIVITY_DAYS", "14"))
    RECOMMENDATION_LOW_CONFIDENCE_THRESHOLD = float(os.getenv("RECOMMENDATION_LOW_CONFIDENCE_THRESHOLD", "0.65"))

    # анализ
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    REPO_SKILL_COUNT_FOR_UPDATE = 10 # количество встреч навыка для обновления уровня
    SKILL_SCORE_DECAY_MAX_DAYS = 15 # максимальный возраст в днях навыка репозитория, учитывающегося при оценке уровня
    SKILL_SCORE_DECAY_INTERVAL = 3 # интервал в днях для вычисления коэффициента снижения оценки
    SKILL_SCORE_DECAY_FACTOR = 0.1 # коэффициент снижения оценки за 1 интервал
    VTOTAL_EPSILON = 0.1 # минимальный уровень навыка при расчёте Vtotal
    HH_API_BASE_URL = "https://api.hh.ru"
    HH_API_USER_AGENT = f"skill-dev-platform/1.0 ({os.getenv('ADMIN_EMAIL')})"
    HH_CLIENT_ID = os.getenv("HH_CLIENT_ID")
    HH_CLIENT_SECRET = os.getenv("HH_CLIENT_SECRET")

    # почта
    MAIL_SMTP_HOST = os.getenv("MAIL_SMTP_HOST", "smtp.beget.com")
    MAIL_SMTP_PORT = int(os.getenv("MAIL_SMTP_PORT", "465"))
    MAIL_SMTP_USERNAME = os.getenv("MAIL_SMTP_USERNAME", "support@it-skill-dev.ru")
    MAIL_SMTP_PASSWORD = os.getenv("MAIL_SMTP_PASSWORD")
    MAIL_FROM_EMAIL = os.getenv("MAIL_FROM_EMAIL", MAIL_SMTP_USERNAME)
    MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "IT Skill Dev")
    MAIL_SMTP_USE_SSL = os.getenv("MAIL_SMTP_USE_SSL", "true").lower() == "true"
    MAIL_SMTP_STARTTLS = os.getenv("MAIL_SMTP_STARTTLS", "false").lower() == "true"
    MAIL_LOGO_CONTENT_ID = "mail-logo"
    MAIL_LOGO_PATH = os.getenv(
        "MAIL_LOGO_PATH",
        str(Path(__file__).resolve().parent / "assets" / "mail-logo.png"),
    )
    MAIL_CODE_TTL_SECONDS = int(os.getenv("MAIL_CODE_TTL_SECONDS", "3600"))
    MAIL_PASSWORD_CHANGE_RATE_LIMIT_SECONDS = int(
        os.getenv("MAIL_PASSWORD_CHANGE_RATE_LIMIT_SECONDS", "60")
    )

    @classmethod
    def string_encryption_key(cls) -> bytes:
        digest = hashlib.sha256(cls.STRING_ENCRYPTION_SECRET.encode("utf-8")).digest()
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
        if not all((cls.DATABASE_URL, cls.REDIS_URL, 
                    cls.JWT_SECRET_KEY, cls.STRING_ENCRYPTION_SECRET,
                    cls.GITHUB_CLIENT_ID, cls.GITHUB_CLIENT_SECRET, cls.OPENROUTER_API_KEY,
                    cls.HH_CLIENT_ID, cls.HH_CLIENT_SECRET,
                    cls.ADMIN_EMAIL, cls.ADMIN_PASSWORD,
                    cls.MAIL_SMTP_USERNAME, cls.MAIL_SMTP_PASSWORD,
                    cls.MAIL_FROM_EMAIL)):
            print("Переменные среды требуют проверки")
            return False
        return True


global_config = Config()
