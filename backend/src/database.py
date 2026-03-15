from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import Config

# Создаем асинхронный движок
engine = create_async_engine(
    Config.DATABASE_URL,
    echo=True,  # логирование SQL запросов
    pool_size=5,
    max_overflow=10,
)

# Создаем фабрику сессий
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Функция для получения сессии (будет использоваться в зависимостях FastAPI)
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
        await session.close()
