from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from .config import global_config
from .models import Base, Role


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


async def init_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def init_roles():
    async with AsyncSessionLocal() as db:
        roles_to_create = ["user", "curator", "admin"]

        for role_name in roles_to_create:
            result = await db.execute(
                select(Role).where(Role.name == role_name)
            )
            existing_role = result.scalar_one_or_none()

            if existing_role is None:
                db.add(Role(name=role_name))

        await db.commit()


async def init_database():
    await init_tables()
    await init_roles()