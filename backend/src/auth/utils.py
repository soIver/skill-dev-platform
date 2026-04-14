from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User
from .service import PasswordService


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not PasswordService.verify(password, user.password_hash):
        return None
    return user

async def register_user(db: AsyncSession, email: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        return None

    new_user = User(
        email=email,
        password_hash=PasswordService.hash(password),
        role="user",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user
