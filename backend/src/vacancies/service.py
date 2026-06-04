import asyncio
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from ..config import global_config
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .schemas import VacancyAreasResponse, VacancyKeywordItem, VacancyKeywordResponse, VacancySearchRequest, VacancySearchResponse
from .utils import build_search_params, map_vacancy_item

logger = get_logger("vacancies.service")
IT_ROLE_CACHE_KEY = "hh:it_professional_roles_v5"
EXCLUDED_IT_ROLE_IDS = {"12", "34", "107", "155", "157"}


class VacanciesService:

    async def get_it_professional_roles(self) -> list[str]:
        role_items = await self._get_it_professional_role_items()
        role_ids = [str(item.get("id")) for item in role_items if item.get("id")]
        return role_ids

    async def _get_it_professional_role_items(self) -> list[dict[str, str]]:
        redis = get_redis()
        try:
            cached = await redis.get(IT_ROLE_CACHE_KEY)
            if cached:
                import json
                role_items = json.loads(cached)
                return self._normalize_role_items(role_items)
        except Exception as exc:
            logger.warning("не удалось прочитать роли из redis: %s", exc)

        role_items = await self._fetch_it_professional_role_items()

        if role_items:
            try:
                import json
                await redis.setex(IT_ROLE_CACHE_KEY, 86400, json.dumps(role_items))
            except Exception as exc:
                logger.warning("не удалось сохранить роли в redis: %s", exc)

        return role_items

    async def get_areas(self, q: str = "") -> VacancyAreasResponse:
        normalized_query = q.strip()
        if len(normalized_query) < 2:
            return VacancyAreasResponse(items=[])

        payload = await self._fetch_hh_json("/suggests/area_leaves", params={"text": normalized_query})
        items = payload.get("items") if isinstance(payload, dict) else []
        result_items = []

        for item in items or []:
            if not isinstance(item, dict):
                continue

            area_id = str(item.get("id") or "").strip()
            area_name = str(item.get("text") or "").strip()
            if not area_id or not area_name:
                continue

            parent = item.get("parent") or {}
            parent_name = str(parent.get("text") or "").strip()
            full_name = area_name if not parent_name else f"{parent_name} / {area_name}"
            result_items.append({
                "id": area_id,
                "name": area_name,
                "full_name": full_name,
            })

        return VacancyAreasResponse(items=result_items[:20])

    async def get_keywords(self, q: str = "") -> VacancyKeywordResponse:
        normalized_query = q.strip()
        if len(normalized_query) < 2:
            return VacancyKeywordResponse(items=[])

        it_role_ids = set(await self.get_it_professional_roles())
        payload = await self._fetch_hh_json("/suggests/vacancy_positions", params={"text": normalized_query})
        items = payload.get("items") if isinstance(payload, dict) else []
        result_items = []
        seen_texts: set[str] = set()

        for index, item in enumerate(items or []):
            if not isinstance(item, dict):
                continue

            role_matches = False
            for role in item.get("professional_roles") or []:
                if not isinstance(role, dict):
                    continue
                role_id = str(role.get("id") or "").strip()
                if role_id and role_id in it_role_ids:
                    role_matches = True
                    break
            if not role_matches:
                continue

            text = str(item.get("text") or "").strip()
            if not text or text.lower() in seen_texts:
                continue
            seen_texts.add(text.lower())
            result_items.append(VacancyKeywordItem(id=f"{index}:{text}", text=text))

        return VacancyKeywordResponse(items=result_items[:20])

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

        mapped_items = [
            map_vacancy_item(item)
            for item in items
            if isinstance(item, dict)
        ]

        return VacancySearchResponse(
            items=mapped_items,
            found=int(response_payload.get("found") or 0),
        )

    async def _fetch_it_professional_role_items(self) -> list[dict[str, str]]:
        payload = await self._fetch_hh_json("/professional_roles")
        return self._extract_role_items_from_professional_roles(payload)

    def _extract_role_items_from_professional_roles(self, payload: Any) -> list[dict[str, str]]:
        if isinstance(payload, dict):
            categories = payload.get("categories") or []
        elif isinstance(payload, list):
            categories = payload
        else:
            categories = []

        role_items = []
        seen_ids: set[str] = set()

        for category in categories:
            if not isinstance(category, dict):
                continue

            category_name = str(category.get("name") or "").strip().lower()
            if not self._is_it_category_name(category_name):
                continue

            self._collect_allowed_roles(category.get("roles") or [], role_items, seen_ids, parent_excluded=False)

        return role_items

    def _normalize_role_items(self, role_items: Any) -> list[dict[str, str]]:
        normalized_items = []
        seen_ids: set[str] = set()

        for item in role_items or []:
            if not isinstance(item, dict):
                continue
            role_id = str(item.get("id") or "").strip()
            role_name = str(item.get("name") or item.get("text") or "").strip()
            if not role_id or not role_name or role_id in seen_ids:
                continue
            seen_ids.add(role_id)
            normalized_items.append({"id": role_id, "name": role_name})

        return normalized_items

    def _is_it_category_name(self, category_name: str) -> bool:
        return (
            "информационные технологии" in category_name
            or "information technology" in category_name
            or "it-специалисты" in category_name
            or "ит-специалисты" in category_name
            or "it, интернет" in category_name
            or "ит, интернет" in category_name
        )

    def _collect_allowed_roles(self, roles: Any, role_items: list[dict[str, str]], seen_ids: set[str], parent_excluded: bool):
        for role in roles or []:
            if not isinstance(role, dict):
                continue

            role_id = str(role.get("id") or "").strip()
            role_name = str(role.get("name") or "").strip()
            is_excluded = parent_excluded or role_id in EXCLUDED_IT_ROLE_IDS

            if role_id and role_name and not is_excluded and role_id not in seen_ids:
                seen_ids.add(role_id)
                role_items.append({"id": role_id, "name": role_name})

            nested_roles = role.get("roles") or role.get("children") or []
            if nested_roles:
                self._collect_allowed_roles(nested_roles, role_items, seen_ids, is_excluded)

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
