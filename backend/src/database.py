from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import global_config

# асинхронный движок
engine = create_async_engine(
    global_config.DATABASE_URL,
    echo=global_config.DEFAULT_LOGGER_LEVEL == "DEBUG",  # логирование запросов в дебаг-режиме
    pool_size=5,
    max_overflow=10,
)

# фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# функция для получения сессии
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
        await session.close()
