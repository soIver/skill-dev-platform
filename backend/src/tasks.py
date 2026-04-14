import asyncio

from .auth.service import cleanup_expired_refresh_tokens
from .celery_app import celery_app
from .database import AsyncSessionLocal
from .logger import get_logger

logger = get_logger("tasks")


@celery_app.task(name="src.tasks.cleanup_expired_refresh_tokens_task")
def cleanup_expired_refresh_tokens_task() -> int:
    return asyncio.run(_cleanup_expired_refresh_tokens())

async def _cleanup_expired_refresh_tokens() -> int:
    async with AsyncSessionLocal() as session:
        deleted_tokens = await cleanup_expired_refresh_tokens(session)

    logger.debug("Deleted %s expired refresh token(s)", deleted_tokens)
    return deleted_tokens
