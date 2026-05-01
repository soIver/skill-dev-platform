import hashlib
import secrets
from base64 import urlsafe_b64encode
from datetime import datetime, timedelta, timezone
from typing import Sequence

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext


def generate_urlsafe_token(length: int) -> str:
    return secrets.token_urlsafe(length)


class Hasher:
    def __init__(self, schemes: Sequence[str], deprecated: str = "auto"):
        self._context = CryptContext(schemes=list(schemes), deprecated=deprecated)

    def verify(self, plain_value: str, hashed_value: str) -> bool:
        return self._context.verify(plain_value, hashed_value)

    def hash(self, value: str) -> str:
        return self._context.hash(value)

    @staticmethod
    def sha256_digest(value: str) -> bytes:
        return hashlib.sha256(value.encode("utf-8")).digest()

    @classmethod
    def sha256_base64url(cls, value: str) -> str:
        digest = cls.sha256_digest(value)
        return urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


class JwtCodec:
    def __init__(self, secret_key: str, algorithm: str):
        self._secret_key = secret_key
        self._algorithm = algorithm

    def encode(self, payload: dict, expires_delta: timedelta) -> str:
        token_payload = payload.copy()
        token_payload["exp"] = datetime.now(timezone.utc) + expires_delta
        return jwt.encode(
            token_payload,
            self._secret_key,
            algorithm=self._algorithm,
        )

    def decode(self, token: str, expected_type: str) -> dict:
        try:
            payload = jwt.decode(
                token,
                self._secret_key,
                algorithms=[self._algorithm],
            )
        except JWTError as exc:
            raise ValueError("Недействительный токен") from exc

        if payload.get("type") != expected_type or not payload.get("jti"):
            raise ValueError("Недействительный токен")

        return payload

    @staticmethod
    def get_unverified_claims(token: str) -> dict:
        try:
            return jwt.get_unverified_claims(token)
        except JWTError as exc:
            raise ValueError("Недействительный токен") from exc


class Cipher:
    def __init__(self, secret_key: bytes, algorithm: str):
        self._algorithm = algorithm.lower()
        self._cipher = Fernet(secret_key)

    def encrypt(self, value: str) -> str:
        return self._cipher.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        try:
            return self._cipher.decrypt(value.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Не удалось расшифровать значение") from exc
