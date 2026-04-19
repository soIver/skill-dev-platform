from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User, Role
from .service import PasswordService


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.email == email)
    )
    user = result.unique().scalar_one_or_none()
    if user is None or not PasswordService.verify(password, user.password_hash):
        return None
    return user

async def register_user(db: AsyncSession, email: str, password: str) -> User | None:
    registered_user_result = await db.execute(select(User).where(User.email == email))
    if registered_user_result.scalar_one_or_none() is not None:
        return None

    user_role_result = await db.execute(select(Role).where(Role.name == "user"))
    user_role = user_role_result.scalar_one_or_none()
    if user_role is None:
        return None

    new_user = User(
        email=email,
        password_hash=PasswordService.hash(password),
        role=user_role,
    )
    db.add(new_user)
    await db.commit()

    result = await db.execute(
        select(User)
        .options(joinedload(User.role))
        .where(User.id == new_user.id)
    )
    return result.unique().scalar_one()
