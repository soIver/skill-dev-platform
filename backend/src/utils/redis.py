from redis.asyncio import Redis, from_url
from ..config import global_config
from .logger import get_logger

logger = get_logger("utils.redis")

class RedisClient:
    _instance: Redis | None = None

    @classmethod
    def get_client(cls) -> Redis:
        if cls._instance is None:
            if not global_config.REDIS_URL:
                logger.error("REDIS_URL не задан в env-переменных")
                raise RuntimeError("Redis is not configured")
            
            cls._instance = from_url(
                global_config.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            logger.debug("Установлено соединение с Redis")
        return cls._instance

    @classmethod
    async def close(cls):
        if cls._instance is not None:
            await cls._instance.close()
            cls._instance = None
            logger.debug("Соединение с Redis разорвано")

def get_redis() -> Redis:
    return RedisClient.get_client()
