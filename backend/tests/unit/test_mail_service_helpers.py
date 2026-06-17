import asyncio

import pytest
from fastapi import HTTPException

from src.mail.service import MailService


class FakeRedis:
    async def ttl(self, key):
        return {"active": 42}.get(key, -2)

    async def hgetall(self, key):
        return {}


def test_mail_service_static_keys_and_urls(monkeypatch):
    monkeypatch.setattr("src.mail.service.global_config.FRONTEND_BASE_URL", "https://app.example.com/")
    monkeypatch.setattr("src.mail.service.global_config.DAYS_FOR_EMAIL_CHANGE", 30)

    assert MailService._build_password_change_url("a b").endswith("code=a%20b")
    assert MailService._build_email_confirmation_url("x/y").endswith("code=x/y")
    assert MailService._password_change_code_key("abc") == "mail:password_change:code:abc"
    assert MailService._email_change_block_seconds() == 30 * 24 * 60 * 60


def test_mail_service_get_retry_after_normalizes_missing_ttl():
    service = MailService(db=None, redis=FakeRedis())

    assert asyncio.run(service._get_retry_after("active")) == 42
    assert asyncio.run(service._get_retry_after("missing")) == 0


def test_mail_service_code_lookup_raises_404_for_missing_code():
    service = MailService(db=None, redis=FakeRedis())

    with pytest.raises(HTTPException) as error:
        asyncio.run(service._get_password_change_code_data("missing"))

    assert error.value.status_code == 404
