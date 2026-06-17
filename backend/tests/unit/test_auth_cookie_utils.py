from fastapi import Response

from src.auth.service import TokenPair
from src.auth.utils import clear_auth_cookies, set_auth_cookies


def test_set_auth_cookies_write_expected_cookie_names():
    response = Response()

    set_auth_cookies(response, TokenPair(access_token="access", refresh_token="refresh"))
    cookies = response.headers.getlist("set-cookie")

    assert any("access_token=access" in item and "Path=/api" in item for item in cookies)
    assert any("refresh_token=refresh" in item and "Path=/api/auth" in item for item in cookies)


def test_clear_auth_cookies_expires_cookie_names():
    response = Response()

    clear_auth_cookies(response)
    cookies = response.headers.getlist("set-cookie")

    assert any("access_token=" in item and "Max-Age=0" in item for item in cookies)
    assert any("refresh_token=" in item and "Max-Age=0" in item for item in cookies)
