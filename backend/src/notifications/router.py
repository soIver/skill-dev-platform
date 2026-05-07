# import asyncio
# from fastapi import APIRouter, Depends, Request
# from fastapi.responses import StreamingResponse

# from ..auth.utils import TokenClaims, get_current_user
# from ..github.service import GitHubService
# from ..utils.logger import get_logger

# logger = get_logger("notifications.router")

# router = APIRouter(prefix="/notifications", tags=["notifications"])

# async def event_generator(request: Request, user_id: int):
#     redis = GitHubService._get_redis()
#     if not redis:
#         logger.error("Redis is not available for notifications")
#         yield "event: error\ndata: Redis unavailable\n\n"
#         return

#     pubsub = redis.pubsub()
#     channel = f"notifications:{user_id}"
#     await pubsub.subscribe(channel)
    
#     try:
#         while True:
#             # Проверка отключения клиента
#             if await request.is_disconnected():
#                 break
            
#             # Уменьшить таймаут — быстрее реагирует на shutdown
#             try:
#                 message = await asyncio.wait_for(
#                     pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5),
#                     timeout=0.5
#                 )
#             except asyncio.TimeoutError:
#                 # Нет сообщений — просто проверяем is_disconnected снова
#                 continue
                
#             if message:
#                 data = message["data"]
#                 if isinstance(data, bytes):
#                     data = data.decode("utf-8")
#                 yield f"data: {data}\n\n"
                
#     except asyncio.CancelledError:
#         # Критически важно: обрабатываем отмену
#         logger.debug("Notification stream cancelled")
#     finally:
#         await pubsub.unsubscribe(channel)
#         await pubsub.close()

# @router.get("/stream")
# async def stream_notifications(
#     request: Request,
#     claims: TokenClaims = Depends(get_current_user),
# ):
#     return StreamingResponse(event_generator(request, claims.user_id), media_type="text/event-stream")
