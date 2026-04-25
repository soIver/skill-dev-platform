from celery import Celery
from ..config import Config


celery_app = Celery(
    "skill_dev",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    timezone=Config.CELERY_TIMEZONE,
    enable_utc=False,
)
