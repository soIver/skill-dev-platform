from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select, text

from ..config import global_config
from ..models import Base, Role, User
from .crypto import Hasher
from .logger import get_logger

logger = get_logger("database")
password_hasher = Hasher(
    schemes=global_config.PASSWORD_HASH_SCHEMES
)

# асинхронный движок
db_engine = create_async_engine(
    global_config.DATABASE_URL,
    echo=global_config.DEFAULT_LOGGER_LEVEL == "DEBUG",
    pool_size=5,
    max_overflow=10,
)

# фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    db_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# функция для получения сессии
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
        await session.close()


async def init_tables():
    async with db_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        await ensure_database_triggers(conn)
        logger.debug("Таблицы БД созданы")


async def ensure_database_triggers(conn):
    await conn.execute(text("""
        CREATE OR REPLACE FUNCTION delete_unused_level_after_skill_level_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM skill_levels WHERE level_id = OLD.level_id
            ) THEN
                DELETE FROM levels WHERE id = OLD.level_id;
            END IF;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    """))
    await conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_delete_unused_level_after_skill_level_delete'
            ) THEN
                CREATE TRIGGER trg_delete_unused_level_after_skill_level_delete
                AFTER DELETE ON skill_levels
                FOR EACH ROW
                EXECUTE FUNCTION delete_unused_level_after_skill_level_delete();
            END IF;
        END $$;
    """))
    await conn.execute(text("""
        CREATE OR REPLACE FUNCTION delete_empty_test_group_after_test_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            IF pg_trigger_depth() = 1
                AND OLD.test_group_id IS NOT NULL
                AND NOT EXISTS (
                SELECT 1 FROM tests WHERE test_group_id = OLD.test_group_id
            ) THEN
                DELETE FROM test_groups WHERE id = OLD.test_group_id;
            END IF;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    """))
    await conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_delete_empty_test_group_after_test_delete'
            ) THEN
                CREATE TRIGGER trg_delete_empty_test_group_after_test_delete
                AFTER DELETE ON tests
                FOR EACH ROW
                EXECUTE FUNCTION delete_empty_test_group_after_test_delete();
            END IF;
        END $$;
    """))


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
        logger.debug("Роли созданы")


async def create_admin():
    if not global_config.ADMIN_EMAIL or not global_config.ADMIN_PASSWORD:
        logger.warning(
            "Запись администратора не создана: ADMIN_EMAIL или ADMIN_PASSWORD не заданы"
        )
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = result.scalar_one_or_none()

        if admin_role is None:
            logger.warning("Запись администратора не создана: роль admin не найдена")
            return

        result = await db.execute(
            select(User).where(User.email == global_config.ADMIN_EMAIL)
        )
        existing_admin = result.scalar_one_or_none()

        if existing_admin is not None:
            logger.debug("Запись администратора уже существует")
            return

        admin_user = User(
            username="admin",
            email=global_config.ADMIN_EMAIL,
            password_hash=password_hasher.hash(global_config.ADMIN_PASSWORD),
            role_id=admin_role.id,
        )

        db.add(admin_user)
        await db.commit()
        logger.debug("Запись администратора создана")


async def init_database():
    await init_tables()
    await init_roles()
    await create_admin()
    logger.debug("Инициализация БД выполнена успешно")
