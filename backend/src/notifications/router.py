import asyncio
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth.utils import TokenClaims, get_current_user
from ..utils.logger import get_logger
from ..utils.redis import get_redis

logger = get_logger("notifications.router")

router = APIRouter(prefix="/notifications", tags=["notifications"])

# глобальный сигнал остановки, устанавливается при shutdown FastAPI
shutdown_event = asyncio.Event()


async def event_generator(request: Request, user_id: int):
    redis = get_redis()
    pubsub = redis.pubsub()
    channel = f"notifications:{user_id}"
    await pubsub.subscribe(channel)

    logger.info(f"User {user_id} connected to notifications stream")

    try:
        while not shutdown_event.is_set():
            if await request.is_disconnected():
                logger.info(f"User {user_id} disconnected from notifications stream")
                break

            try:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=0.5
                )
                if message:
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    yield f"data: {data}\n\n"
                else:
                    # heartbeat для поддержания соединения
                    yield ": heartbeat\n\n"

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in notification stream for user {user_id}: {e}")
                break

    except asyncio.CancelledError:
        logger.debug(f"Notification stream for user {user_id} cancelled")
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            pass


@router.get("/stream")
async def stream_notifications(
    request: Request,
    claims: TokenClaims = Depends(get_current_user),
):
    return StreamingResponse(
        event_generator(request, claims.user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # важно для Nginx
        },
    )
