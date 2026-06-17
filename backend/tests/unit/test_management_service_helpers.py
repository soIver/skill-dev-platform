import asyncio

from src.management.service import (
    INVITATION_TYPE_REGISTRATION,
    INVITATION_TYPE_ROLE,
    ManagementService,
)


class FakeRedis:
    def __init__(self, data_by_key=None):
        self.data_by_key = data_by_key or {}

    async def hgetall(self, key):
        return self.data_by_key.get(key, {})


def test_management_invitation_urls_and_keys(monkeypatch):
    monkeypatch.setattr("src.management.service.global_config.FRONTEND_BASE_URL", "https://app.example.com/")

    assert ManagementService._build_registration_invitation_url("a b") == "https://app.example.com/auth/confirm-email?code=a%20b"
    assert ManagementService._build_role_invitation_url("x/y") == "https://app.example.com/auth/confirm-curator?code=x/y"
    assert ManagementService._invitation_code_key("abc") == "management:curator_invitation:code:abc"
    assert ManagementService._invitation_active_key("curator@example.com") == "management:curator_invitation:active:curator@example.com"


def test_management_invitation_constants_are_stable():
    assert INVITATION_TYPE_REGISTRATION == "registration"
    assert INVITATION_TYPE_ROLE == "role"


def test_get_invitation_code_data_returns_none_for_missing_code():
    service = ManagementService(db=None, redis=FakeRedis())

    assert asyncio.run(service._get_invitation_code_data("missing")) is None


def test_get_invitation_code_data_returns_stored_mapping():
    key = ManagementService._invitation_code_key("code")
    service = ManagementService(db=None, redis=FakeRedis({key: {"email": "curator@example.com"}}))

    assert asyncio.run(service._get_invitation_code_data("code")) == {"email": "curator@example.com"}
