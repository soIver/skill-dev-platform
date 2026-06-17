from datetime import datetime, timedelta, timezone

import pytest

from src.skills.utils import calculate_adjusted_score, calculate_vtotal


def test_calculate_vtotal_uses_only_available_sources():
    result = calculate_vtotal(
        relations=[(1, 0.5), (2, 1.0), (3, 0.5)],
        source_scores={1: 100, 2: 25},
        epsilon=0.1,
    )

    assert result == pytest.approx(0.397, abs=0.001)


def test_calculate_vtotal_returns_neutral_value_without_relations_or_scores():
    assert calculate_vtotal([], {}) == 1.0
    assert calculate_vtotal([(1, 0.5)], {}) == 1.0


def test_calculate_adjusted_score_decays_old_scores():
    old_date = datetime.now(timezone.utc) - timedelta(days=9)

    assert calculate_adjusted_score(100, old_date) == 70
    assert calculate_adjusted_score(80, None) == 80
