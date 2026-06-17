import pytest
from cryptography.fernet import Fernet

from src.utils.crypto import Cipher


def test_cipher_encrypts_and_decrypts_values():
    cipher = Cipher(secret_key=Fernet.generate_key(), algorithm="fernet")

    encrypted = cipher.encrypt("github-token")

    assert encrypted != "github-token"
    assert cipher.decrypt(encrypted) == "github-token"


def test_cipher_rejects_invalid_token():
    cipher = Cipher(secret_key=Fernet.generate_key(), algorithm="fernet")

    with pytest.raises(ValueError):
        cipher.decrypt("not-a-fernet-token")
