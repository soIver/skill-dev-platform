import json

import pytest
from pydantic import ValidationError

from src.vacancies.schemas import VacancySearchRequest
from src.vacancies.utils import build_search_params


def test_build_search_params_normalizes_request_for_hh_api():
    payload = VacancySearchRequest(
        description=" Python FastAPI ",
        excluded_words="PHP",
        salary_range={"from": 150000, "to": 250000, "gross": True},
        area_ids=["1", "1", " 2 "],
        experience="between1And3",
        schedule=["remote"],
        accredited_it_employer=True,
        less_than_10_negotiations=True,
        only_with_salary=True,
        page=2,
    )

    params = build_search_params(payload, ["96", "156"])

    assert params["text"] == "Python FastAPI"
    assert params["area"] == ["1", "2"]
    assert params["experience"] == ["between1And3"]
    assert params["label"] == "accredited_it"
    assert params["parttime"] == "less_than_10_negotiations"
    assert params["only_with_salary"] == "true"
    assert json.loads(params["salary_range"])["from"] == 150000


def test_vacancy_search_request_rejects_unknown_experience():
    with pytest.raises(ValidationError):
        VacancySearchRequest(experience=["unknown"])
