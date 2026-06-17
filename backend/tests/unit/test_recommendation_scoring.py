from datetime import datetime, timedelta, timezone

import pytest

from src.recommendations.service import RecommendationService, SkillProfile


def test_freshness_score_prefers_stale_or_missing_activity():
    service = RecommendationService(db=None, redis=None)
    old_date = datetime.now(timezone.utc) - timedelta(days=90)

    assert service._freshness_score(None) == 1.0
    assert service._freshness_score(old_date) == 1.0
    assert service._freshness_score(datetime.now(timezone.utc)) == 0.0


def test_score_skill_targets_uses_best_relevant_target(monkeypatch):
    fixed_now = datetime(2026, 6, 17, tzinfo=timezone.utc)
    service = RecommendationService(db=None, redis=None)
    monkeypatch.setattr(service, "_now", lambda: fixed_now)
    profiles = {
        1: SkillProfile(
            skill_id=1,
            current_skill_level_id=10,
            current_order_index=1,
            confidence=0.1,
            score=30,
        )
    }

    score = service._score_skill_targets(
        targets=[(11, 1, 2), (12, 1, 4), (13, 2, 1)],
        skill_profiles=profiles,
        last_dates={11: fixed_now - timedelta(days=30)},
    )

    assert score == pytest.approx(0.886, abs=0.001)
