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
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
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

    # анализ
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    REPO_SKILL_COUNT_FOR_UPDATE = 10 # количество встреч навыка для обновления уровня
    SKILL_SCORE_DECAY_MAX_DAYS = 15 # максимальный возраст в днях навыка репозитория, учитывающегося при оценке уровня
    SKILL_SCORE_DECAY_INTERVAL = 3 # интервал в днях для вычисления коэффициента снижения оценки
    SKILL_SCORE_DECAY_FACTOR = 0.1 # коэффициент снижения оценки за 1 интервал
    VTOTAL_EPSILON = 0.1 # минимальный уровень навыка при расчёте Vtotal
    HH_API_BASE_URL = "https://api.hh.ru"
    HH_API_USER_AGENT = os.getenv(
        "HH_API_USER_AGENT",
        f"skill-dev-platform/1.0 ({os.getenv('ADMIN_EMAIL')})",
    )
    HH_API_TIMEOUT_SECONDS = float(os.getenv("HH_API_TIMEOUT_SECONDS", "15"))

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
                    cls.ADMIN_EMAIL, cls.ADMIN_PASSWORD)):
            print("Переменные среды требуют проверки")
            return False
        return True


global_config = Config()
