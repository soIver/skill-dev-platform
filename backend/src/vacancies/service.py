from typing import Any

import httpx
from fastapi import HTTPException, status

from ..config import global_config
from ..utils.logger import get_logger
from .schemas import VacancyAreasResponse, VacancySearchRequest, VacancySearchResponse
from .utils import build_search_params, flatten_area_leaves, map_vacancy_item

logger = get_logger("vacancies.service")


class VacanciesService:

    async def get_areas(self) -> VacancyAreasResponse:
        payload = await self._fetch_hh_json("/areas")
        if not isinstance(payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул неожиданный ответ по регионам",
            )

        areas = flatten_area_leaves(payload)
        return VacancyAreasResponse(items=areas)

    async def search_vacancies(self, payload: VacancySearchRequest) -> VacancySearchResponse:
        response_payload = await self._fetch_hh_json("/vacancies", build_search_params(payload))
        if not isinstance(response_payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул неожиданный ответ по вакансиям",
            )

        items = response_payload.get("items") or []
        if not isinstance(items, list):
            items = []

        return VacancySearchResponse(
            items=[map_vacancy_item(item) for item in items if isinstance(item, dict)],
            found=int(response_payload.get("found") or 0),
        )

    async def _fetch_hh_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        headers = {
            "User-Agent": global_config.HH_API_USER_AGENT,
            "HH-User-Agent": global_config.HH_API_USER_AGENT,
            "Accept": "application/json",
        }
        # Временно, только для диагностики
        logger.info(f"Отправляемый User-Agent (raw): {global_config.HH_API_USER_AGENT!r}")
        try:
            async with httpx.AsyncClient(
                base_url=global_config.HH_API_BASE_URL,
                headers=headers,
                timeout=global_config.HH_API_TIMEOUT_SECONDS,
            ) as client:
                response = await client.get(path, params=params)
        except httpx.HTTPError as exc:
            logger.warning("Не удалось выполнить запрос к HeadHunter: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось получить данные из HeadHunter",
            ) from exc

        if response.status_code >= 400:
            logger.exception(
                "HeadHunter вернул ошибку %s для %s",
                response.status_code,
                path,
            )
            detail = extract_hh_error(response)
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

        try:
            return response.json()
        except ValueError as exc:
            logger.warning("HeadHunter вернул невалидный JSON для %s", path)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул невалидный ответ",
            ) from exc


def extract_hh_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        if response.status_code == 403:
            return "HeadHunter отклонил запрос. Проверьте HH-User-Agent или сетевые ограничения для IP сервера"
        return "HeadHunter временно недоступен"

    if isinstance(payload, dict):
        description = payload.get("description")
        if description:
            return f"Ошибка HeadHunter: {description}"

        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first_error = errors[0]
            if isinstance(first_error, dict):
                reason = first_error.get("description") or first_error.get("type")
                if reason:
                    return f"Ошибка HeadHunter: {reason}"

    return "HeadHunter не смог обработать запрос"
