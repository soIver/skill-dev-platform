from datetime import datetime, timezone

from src.recommendations.service import CandidateRecommendation, RecommendationService


def test_candidate_recommendation_id_depends_on_type_and_target():
    assert CandidateRecommendation("task", 10, 0.8).id == "task-10"
    assert CandidateRecommendation("test", 5, 0.9).id == "test-5"


def test_recommendation_keys_are_stable():
    assert RecommendationService._items_key(7) == "recommendations:user:7:items"
    assert RecommendationService._item_key(7, "task-2") == "recommendations:user:7:item:task-2"
    assert RecommendationService._skips_key(7) == "recommendations:user:7:skips"
    assert RecommendationService._ttl_seconds() > 0
    assert RecommendationService._week_seconds() == 7 * 86400


def test_recommendation_datetime_helpers_roundtrip_naive_values():
    value = datetime(2026, 6, 17, 10, 30, tzinfo=timezone.utc)
    formatted = RecommendationService._format_dt(value)

    assert RecommendationService._parse_dt(formatted) == value
    assert RecommendationService._parse_dt("2026-06-17T10:30:00").tzinfo == timezone.utc
