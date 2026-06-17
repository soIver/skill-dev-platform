import pytest

from src.auth.service import InvalidCredentialsError, InvalidTokenError, TokenService, UserAlreadyExistsError


def test_token_service_static_keys_and_defaults():
    assert TokenService._refresh_key(1, "abc") == "auth:refresh:1:abc"
    assert TokenService._device_key(1, "device") == "auth:refresh:device:1:device"
    assert TokenService._access_valid_after_key(1) == "auth:access:valid_after:1"
    assert TokenService._normalize_device_id(None) == "unknown-device"
    assert TokenService._normalize_device_id("browser") == "browser"


def test_token_service_extract_user_id_accepts_numeric_subject():
    service = TokenService(db=None)

    assert service._extract_user_id({"sub": "42"}) == 42


@pytest.mark.parametrize("payload", [{}, {"sub": None}, {"sub": "abc"}])
def test_token_service_extract_user_id_rejects_invalid_subject(payload):
    service = TokenService(db=None)

    with pytest.raises(ValueError):
        service._extract_user_id(payload)


def test_auth_service_http_exceptions_have_expected_status_codes():
    assert InvalidCredentialsError("bad").status_code == 401
    assert InvalidTokenError("bad").status_code == 401
    assert UserAlreadyExistsError("exists").status_code == 409
