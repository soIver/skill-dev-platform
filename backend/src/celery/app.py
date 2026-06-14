from celery import Celery
from celery.schedules import crontab
from ..config import global_config


celery_app = Celery(
    "skill_dev",
    broker=global_config.CELERY_BROKER_URL,
    backend=global_config.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    timezone="Europe/Moscow",
    enable_utc=False,
    beat_schedule_filename=f"data/celerybeat-schedule",
    worker_hijack_root_logger=False,
    beat_schedule={
        "enqueue-daily-recommendation-generation": {
            "task": "enqueue_recommendation_generation_task",
            "schedule": crontab(hour=6, minute=0),
        },
    },
)

celery_app.autodiscover_tasks(["src.celery"])
