import asyncio

import httpx
import pytest
from fastapi import HTTPException

from src.vacancies import service as vacancies_service
from src.vacancies.service import HH_TOKEN_CACHE_KEY, VacanciesService


class FakeRedis:
    def __init__(self):
        self.setex_calls: list[tuple[str, int, str]] = []

    async def setex(self, key: str, ttl: int, value: str):
        self.setex_calls.append((key, ttl, value))


class FakeHttpClient:
    def __init__(self, response: httpx.Response, **kwargs):
        self.response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, path: str, data: dict[str, str]):
        return self.response


@pytest.fixture(autouse=True)
def reset_vacancy_token_cache():
    VacanciesService._in_memory_token = None
    VacanciesService._in_memory_expires_at = 0.0
    VacanciesService._lock = None
    yield
    VacanciesService._in_memory_token = None
    VacanciesService._in_memory_expires_at = 0.0
    VacanciesService._lock = None


def test_in_memory_token_is_used_until_actual_expiration(monkeypatch):
    VacanciesService._in_memory_token = "cached-token"
    VacanciesService._in_memory_expires_at = 1030.0
    monkeypatch.setattr(vacancies_service.time, "time", lambda: 1000.0)

    token = asyncio.run(VacanciesService()._get_cached_token())

    assert token == "cached-token"


def test_new_token_is_cached_for_full_expires_in(monkeypatch):
    response = httpx.Response(
        200,
        json={"access_token": "new-token", "expires_in": 120},
        request=httpx.Request("POST", "https://api.hh.ru/token"),
    )
    redis = FakeRedis()
    monkeypatch.setattr(vacancies_service.httpx, "AsyncClient", lambda **kwargs: FakeHttpClient(response, **kwargs))
    monkeypatch.setattr(vacancies_service, "get_redis", lambda: redis)
    monkeypatch.setattr(vacancies_service.time, "time", lambda: 1000.0)
    monkeypatch.setattr(vacancies_service.global_config, "HH_CLIENT_ID", "client-id")
    monkeypatch.setattr(vacancies_service.global_config, "HH_CLIENT_SECRET", "client-secret")

    token = asyncio.run(VacanciesService()._fetch_new_token())

    assert token == "new-token"
    assert VacanciesService._in_memory_expires_at == 1120.0
    assert redis.setex_calls == [(HH_TOKEN_CACHE_KEY, 120, "new-token")]


def test_refresh_too_early_does_not_fall_back_to_anonymous_request(monkeypatch):
    response = httpx.Response(
        403,
        json={"error": "forbidden", "error_description": "app token refresh too early"},
        request=httpx.Request("POST", "https://api.hh.ru/token"),
    )
    monkeypatch.setattr(vacancies_service.httpx, "AsyncClient", lambda **kwargs: FakeHttpClient(response, **kwargs))
    monkeypatch.setattr(vacancies_service.global_config, "HH_CLIENT_ID", "client-id")
    monkeypatch.setattr(vacancies_service.global_config, "HH_CLIENT_SECRET", "client-secret")

    with pytest.raises(HTTPException) as error:
        asyncio.run(VacanciesService()._fetch_new_token())

    assert error.value.status_code == 502
    assert "до истечения текущего токена" in error.value.detail
