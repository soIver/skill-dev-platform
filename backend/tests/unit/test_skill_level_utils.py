import pytest

from src.skills.utils import calculate_confidence, get_level_index_normal, get_level_score_bounds


def test_get_level_index_normal_clamps_edges():
    assert get_level_index_normal(0, 4) == 0
    assert get_level_index_normal(100, 4) == 3
    assert get_level_index_normal(50, 1) == 0
    assert get_level_index_normal(50, 0) == 0


def test_get_level_score_bounds_returns_ordered_bounds():
    lower, upper = get_level_score_bounds(1, 4)

    assert 0 <= lower < upper <= 100
    assert get_level_score_bounds(0, 1) == (0.0, 100.0)
    assert get_level_score_bounds(0, 0) == (0.0, 100.0)


def test_calculate_confidence_peaks_near_level_midpoint():
    lower, upper = get_level_score_bounds(2, 5)
    midpoint = (lower + upper) / 2

    assert calculate_confidence(midpoint, 5, 2) == pytest.approx(1.0)
    assert calculate_confidence(-100, 5, 2) == 0.0
    assert calculate_confidence(50, 0, 0) == 0.0
