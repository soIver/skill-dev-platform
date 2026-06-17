from datetime import datetime, timezone

from src.progress.service import ProgressActivityService


def test_progress_timestamp_returns_zero_for_missing_date():
    assert ProgressActivityService._timestamp(None) == 0


def test_progress_timestamp_uses_datetime_timestamp():
    value = datetime(2026, 6, 17, 10, 30, tzinfo=timezone.utc)

    assert ProgressActivityService._timestamp(value) == value.timestamp()
