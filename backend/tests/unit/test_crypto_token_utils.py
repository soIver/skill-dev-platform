from datetime import timedelta

import pytest

from src.utils.crypto import Hasher, JwtCodec, generate_urlsafe_token


def test_generate_urlsafe_token_returns_different_non_empty_values():
    first = generate_urlsafe_token(16)
    second = generate_urlsafe_token(16)

    assert first
    assert second
    assert first != second


def test_hasher_sha256_base64url_is_stable_without_padding():
    digest = Hasher.sha256_base64url("skill-dev")

    assert digest == Hasher.sha256_base64url("skill-dev")
    assert "=" not in digest


def test_jwt_codec_roundtrip_and_type_validation():
    codec = JwtCodec(secret_key="secret-key-for-tests", algorithm="HS256")
    token = codec.encode({"sub": "7", "type": "access", "jti": "abc"}, timedelta(minutes=5))

    assert codec.decode(token, expected_type="access")["sub"] == "7"

    with pytest.raises(ValueError):
        codec.decode(token, expected_type="refresh")


def test_jwt_codec_rejects_payload_without_jti():
    codec = JwtCodec(secret_key="secret-key-for-tests", algorithm="HS256")
    token = codec.encode({"sub": "7", "type": "access"}, timedelta(minutes=5))

    with pytest.raises(ValueError):
        codec.decode(token, expected_type="access")
