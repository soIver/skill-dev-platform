from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import global_config
from ..models import User


def build_github_authorization_url(state: str, code_challenge: str) -> str:
    query = {
        "client_id": global_config.GITHUB_CLIENT_ID,
        "redirect_uri": global_config.GITHUB_REDIRECT_URI,
        "scope": global_config.GITHUB_SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "allow_signup": "true",
    }
    return f"https://github.com/login/oauth/authorize?{urlencode(query)}"


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
