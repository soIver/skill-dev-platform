import asyncio
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth.utils import TokenClaims, get_current_user
from ..utils.logger import get_logger
from ..utils.redis import get_redis

logger = get_logger("notifications.router")

router = APIRouter(prefix="/notifications", tags=["notifications"])

async def event_generator(request: Request, user_id: int):
    redis = get_redis()
    pubsub = redis.pubsub()
    channel = f"notifications:{user_id}"
    await pubsub.subscribe(channel)
    
    logger.info(f"User {user_id} connected to notifications stream")

    try:
        # Включаем прослушивание сообщений
        # В FastAPI StreamingResponse ожидает генератор
        
        # Создаем задачу для прослушивания Redis
        async def listen():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    yield f"data: {data}\n\n"

        # Мы хотим также отправлять heartbeat, чтобы соединение не закрывалось прокси-серверами
        # и проверять, не отключился ли клиент.
        
        listener = listen()
        
        while True:
            if await request.is_disconnected():
                logger.info(f"User {user_id} disconnected from notifications stream")
                break
            
            try:
                # Пытаемся получить сообщение с коротким таймаутом
                # Так как listen() блокирует, нам нужно что-то более гибкое
                # или использовать asyncio.wait
                
                # Используем get_message вместо listen для более простого управления циклом
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    yield f"data: {data}\n\n"
                else:
                    # Отправляем комментарий в качестве heartbeat
                    yield ": heartbeat\n\n"
                    
            except Exception as e:
                logger.error(f"Error in notification stream for user {user_id}: {e}")
                break
                
    except asyncio.CancelledError:
        logger.debug(f"Notification stream for user {user_id} cancelled")
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()

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
            "X-Accel-Buffering": "no", # Важно для Nginx
        }
    )
