from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from src.management.schemas import CuratorInvitationRequest
from src.progress.schemas import ProgressActivityItem
from src.recommendations.schemas import RecommendationItem


def test_curator_invitation_request_reuses_email_validation():
    assert CuratorInvitationRequest(email="curator@example.com").email == "curator@example.com"

    with pytest.raises(ValidationError):
        CuratorInvitationRequest(email="bad-email")


def test_literal_response_schemas_reject_unknown_content_types():
    now = datetime.now(timezone.utc)

    with pytest.raises(ValidationError):
        RecommendationItem(
            id="vacancy-1",
            content_type="vacancy",
            target_id=1,
            score=1.0,
            created_at=now,
            expires_at=now,
            title="Wrong type",
        )

    with pytest.raises(ValidationError):
        ProgressActivityItem(
            id="unknown-1",
            content_type="unknown",
            target_id=1,
            title="Wrong type",
            action_text="",
            occurred_at=now,
        )
