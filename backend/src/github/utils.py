import hashlib
import secrets
from base64 import urlsafe_b64encode
from urllib.parse import urlencode

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import global_config
from ..models import User


_cipher = Fernet(global_config.github_token_encryption_key())


def encrypt_github_token(token: str) -> str:
    return _cipher.encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_github_token(token: str) -> str:
    try:
        return _cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Не удалось расшифровать GitHub token") from exc


def generate_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def generate_pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def build_pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


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
