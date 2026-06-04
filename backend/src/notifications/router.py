import asyncio
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth.utils import TokenClaims, get_current_user
from ..utils.logger import get_logger
from ..utils.redis import get_redis

logger = get_logger("notifications.router")

router = APIRouter(prefix="/notifications", tags=["notifications"])

# глобальный сигнал остановки
shutdown_event = asyncio.Event()
active_pubsubs: set = set()


def reset_shutdown_state():
    shutdown_event.clear()


def trigger_shutdown():
    shutdown_event.set()


async def close_active_streams():
    active_pubsubs_snapshot = list(active_pubsubs)
    for pubsub in active_pubsubs_snapshot:
        try:
            await pubsub.aclose()
        except Exception:
            pass


async def event_generator(request: Request, user_id: int):
    redis = get_redis()
    pubsub = redis.pubsub()
    channel = f"notifications:{user_id}"
    active_pubsubs.add(pubsub)
    await pubsub.subscribe(channel)

    logger.debug(f"Пользователь {user_id} подключился к потоку уведомлений")

    try:
        while not shutdown_event.is_set():
            if await request.is_disconnected():
                logger.info(f"Пользователь {user_id} отключился от потока уведомлений")
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
                logger.exception(f"Ошибка в потоке уведомлений для пользователя {user_id}")
                break

    except asyncio.CancelledError:
        logger.debug(f"Потом уведомлений был отменён для пользователя {user_id}")
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            pass
        active_pubsubs.discard(pubsub)


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
