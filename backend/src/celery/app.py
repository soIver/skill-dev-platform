from celery import Celery
from ..config import global_config


celery_app = Celery(
    "skill_dev",
    broker=global_config.CELERY_BROKER_URL,
    backend=global_config.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    timezone="Europe/Moscow",
    enable_utc=False,
    worker_log_level=global_config.DEFAULT_LOGGER_LEVEL,
    beat_schedule_filename=f"data/celerybeat-schedule"
)
