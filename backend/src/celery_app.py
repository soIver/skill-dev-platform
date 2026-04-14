from celery import Celery
from celery.schedules import crontab

from .config import Config


celery_app = Celery(
    "skill_dev",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    timezone=Config.CELERY_TIMEZONE,
    enable_utc=False,
    imports=("src.tasks",),
    beat_schedule={
        "cleanup-expired-refresh-tokens": {
            "task": "src.tasks.cleanup_expired_refresh_tokens_task",
            "schedule": crontab(hour=0, minute=0),
        }
    },
)
