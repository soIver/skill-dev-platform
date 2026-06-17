import asyncio

import pytest

from src.utils import redis as redis_module
from src.utils.redis import RedisClient


def test_redis_client_requires_url(monkeypatch):
    RedisClient._instance = None
    monkeypatch.setattr(redis_module.global_config, "REDIS_URL", None)

    with pytest.raises(RuntimeError):
        RedisClient.get_client()


def test_redis_client_close_resets_existing_instance():
    class FakeRedis:
        def __init__(self):
            self.closed = False

        async def close(self):
            self.closed = True

    fake = FakeRedis()
    RedisClient._instance = fake

    asyncio.run(RedisClient.close())

    assert fake.closed is True
    assert RedisClient._instance is None
