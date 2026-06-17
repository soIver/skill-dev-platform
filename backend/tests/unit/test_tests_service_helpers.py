from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from src.tests import service


def test_attempt_key_and_datetime_helpers_roundtrip():
    value = datetime(2026, 6, 17, 10, 30, tzinfo=timezone.utc)
    formatted = service._format_dt(value)

    assert service._attempt_key("abc") == "test_attempt:abc"
    assert service._parse_dt(formatted) == value
    assert service._parse_dt("2026-06-17T10:30:00").tzinfo == timezone.utc


def test_remaining_seconds_never_negative():
    expired = {"expires_at": service._format_dt(datetime.now(timezone.utc) - timedelta(seconds=5))}

    assert service._remaining_seconds(expired) == 0


def test_require_state_rejects_missing_and_foreign_attempt(monkeypatch):
    async def missing_state(attempt_id):
        return None

    monkeypatch.setattr(service, "_load_state", missing_state)

    with pytest.raises(HTTPException) as missing_error:
        import asyncio

        asyncio.run(service._require_state("attempt", 1))

    assert missing_error.value.status_code == 404

    async def foreign_state(attempt_id):
        return {"user_id": 2}

    monkeypatch.setattr(service, "_load_state", foreign_state)

    with pytest.raises(HTTPException) as foreign_error:
        import asyncio

        asyncio.run(service._require_state("attempt", 1))

    assert foreign_error.value.status_code == 403
