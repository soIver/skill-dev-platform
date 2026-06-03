import asyncio
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from ..config import global_config
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .schemas import VacancyAreasResponse, VacancySearchRequest, VacancySearchResponse
from .utils import build_search_params, flatten_area_leaves, map_vacancy_item

logger = get_logger("vacancies.service")


class VacanciesService:

    async def get_it_professional_roles(self) -> list[str]:
        redis = get_redis()
        cache_key = "hh:it_professional_roles_v2"
        try:
            cached = await redis.get(cache_key)
            if cached:
                import json
                return json.loads(cached)
        except Exception as exc:
            logger.warning("не удалось прочитать роли из redis: %s", exc)

        payload = await self._fetch_hh_json("/professional_roles")
        roles_list = []
        if isinstance(payload, dict):
            categories = payload.get("categories") or []
        elif isinstance(payload, list):
            categories = payload
        else:
            categories = []

        for cat in categories:
            if isinstance(cat, dict):
                name = cat.get("name") or ""
                name_lower = name.lower()
                is_it_category = (
                    "информационные технологии" in name_lower
                    or "information technology" in name_lower
                    or "it-специалисты" in name_lower
                    or "ит-специалисты" in name_lower
                    or "it, интернет" in name_lower
                    or "ит, интернет" in name_lower
                )
                if is_it_category:
                    for role in cat.get("roles") or []:
                        if isinstance(role, dict) and role.get("id"):
                            roles_list.append(str(role["id"]))

        if roles_list:
            try:
                import json
                await redis.setex(cache_key, 86400, json.dumps(roles_list))
            except Exception as exc:
                logger.warning("не удалось сохранить роли в redis: %s", exc)

        return roles_list

    async def _get_all_flattened_areas(self) -> list[dict[str, Any]]:
        redis = get_redis()
        cache_key = "hh:all_flattened_areas"
        try:
            cached = await redis.get(cache_key)
            if cached:
                import json
                return json.loads(cached)
        except Exception as exc:
            logger.warning("не удалось прочитать регионы из redis: %s", exc)

        payload = await self._fetch_hh_json("/areas")
        if not isinstance(payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул неожиданный ответ по регионам",
            )

        areas = flatten_area_leaves(payload)
        try:
            import json
            await redis.setex(cache_key, 86400, json.dumps(areas))
        except Exception as exc:
            logger.warning("не удалось сохранить регионы в redis: %s", exc)

        return areas

    async def get_areas(self, q: str = "") -> VacancyAreasResponse:
        all_areas = await self._get_all_flattened_areas()
        normalized_query = q.strip().lower()
        if not normalized_query:
            return VacancyAreasResponse(items=all_areas[:20])

        matched = []
        for area in all_areas:
            full_name = area.get("full_name") or ""
            name = area.get("name") or ""
            if normalized_query in full_name.lower():
                name_lower = name.lower()
                if name_lower.startswith(normalized_query):
                    score = 3
                elif normalized_query in name_lower:
                    score = 2
                else:
                    score = 1
                matched.append((area, score))

        matched.sort(
            key=lambda x: (
                -x[1],
                len(x[0].get("name") or ""),
                (x[0].get("name") or "").lower(),
            )
        )
        result_items = [item[0] for item in matched[:20]]
        return VacancyAreasResponse(items=result_items)

    async def search_vacancies(self, payload: VacancySearchRequest) -> VacancySearchResponse:
        it_roles = await self.get_it_professional_roles()
        response_payload = await self._fetch_hh_json("/vacancies", build_search_params(payload, it_roles))
        if not isinstance(response_payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул неожиданный ответ по вакансиям",
            )

        items = response_payload.get("items") or []
        if not isinstance(items, list):
            items = []

        mapped_items = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if payload.salary_range and payload.salary_range.to is not None:
                sal = item.get("salary")
                if sal:
                    sal_from = sal.get("from")
                    if sal_from is not None and sal_from > payload.salary_range.to:
                        continue
            mapped_items.append(map_vacancy_item(item))

        return VacancySearchResponse(
            items=mapped_items,
            found=int(response_payload.get("found") or 0),
        )

    # in-memory кэш токена
    _in_memory_token: str | None = None
    # время истечения in-memory токена
    _in_memory_expires_at: float = 0.0
    # лок для предотвращения гонки при получении токена
    _lock: asyncio.Lock | None = None

    @classmethod
    def get_lock(cls) -> asyncio.Lock:
        # инициализация лока
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock

    async def _get_app_token(self) -> str:
        # быстрый путь без блокировки
        token = await self._get_cached_token()
        if token:
            return token

        # блокировка для предотвращения параллельных запросов
        async with self.get_lock():
            # повторная проверка под блокировкой
            token = await self._get_cached_token()
            if token:
                return token

            # запрашиваем новый токен у hh.ru
            return await self._fetch_new_token()

    async def _get_cached_token(self) -> str | None:
        # локальный in-memory кэш
        now = time.time()
        if VacanciesService._in_memory_token and VacanciesService._in_memory_expires_at > now + 60:
            return VacanciesService._in_memory_token

        # проверка redis
        redis = get_redis()
        cache_key = "hh:app_token"
        try:
            token = await redis.get(cache_key)
            if token:
                # обновление in-memory кэша
                ttl = await redis.ttl(cache_key)
                if ttl > 60:
                    VacanciesService._in_memory_token = token
                    VacanciesService._in_memory_expires_at = now + ttl
                return token
        except Exception as exc:
            logger.warning("не удалось прочитать токен из redis: %s", exc)

        return None

    async def _fetch_new_token(self) -> str:
        # проверка настроек
        if not global_config.HH_CLIENT_ID or not global_config.HH_CLIENT_SECRET:
            logger.error("не заданы HH_CLIENT_ID или HH_CLIENT_SECRET")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="настройки интеграции с hh.ru не настроены",
            )

        # данные запроса
        headers = {
            "User-Agent": global_config.HH_API_USER_AGENT,
            "HH-User-Agent": global_config.HH_API_USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "client_credentials",
            "client_id": global_config.HH_CLIENT_ID,
            "client_secret": global_config.HH_CLIENT_SECRET,
        }

        # выполнение запроса
        try:
            async with httpx.AsyncClient(
                base_url=global_config.HH_API_BASE_URL,
                headers=headers,
            ) as client:
                response = await client.post("/token", data=data)
        except httpx.HTTPError as exc:
            logger.warning("ошибка сети при получении токена hh: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="не удалось авторизоваться в hh.ru",
            ) from exc

        # обработка ответа
        if response.status_code >= 400:
            logger.error("hh.ru отклонил запрос токена: %s %s", response.status_code, response.text)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ошибка авторизации в hh.ru",
            )

        # разбор ответа
        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("hh.ru вернул невалидный json для токена")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="невалидный ответ hh.ru при авторизации",
            ) from exc

        access_token = payload.get("access_token")
        if not access_token:
            logger.warning("ответ hh.ru не содержит access_token")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="не удалось получить токен авторизации hh.ru",
            )

        expires_in = int(payload.get("expires_in") or 3600)
        now = time.time()

        # сохранение в in-memory кэш
        VacanciesService._in_memory_token = access_token
        VacanciesService._in_memory_expires_at = now + expires_in

        # сохранение в redis
        ttl = max(10, expires_in - 60)
        try:
            redis = get_redis()
            await redis.setex("hh:app_token", ttl, access_token)
        except Exception as exc:
            logger.warning("не удалось сохранить токен в redis: %s", exc)

        return access_token

    async def _fetch_hh_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        token = await self._get_app_token()
        headers = {
            "User-Agent": global_config.HH_API_USER_AGENT,
            "HH-User-Agent": global_config.HH_API_USER_AGENT,
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }

        try:
            async with httpx.AsyncClient(
                base_url=global_config.HH_API_BASE_URL,
                headers=headers,
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
