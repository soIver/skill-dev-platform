import asyncio
import hashlib
import re
import time
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import global_config
from ..models import Level, Skill, SkillLevel, Vacancy, VacancyHistory, VacancySkill
from ..recommendations.service import RecommendationService
from ..skills.utils import get_level_index_normal
from ..utils.logger import get_logger
from ..utils.redis import get_redis
from .schemas import (
    AnalyzeVacancyRequest,
    VacancyAnalysisRecommendation,
    VacancyAnalysisResponse,
    VacancyAreasResponse,
    VacancyKeywordItem,
    VacancyKeywordResponse,
    VacancySearchItem,
    VacancySearchRequest,
    VacancySearchResponse,
    VacancySkillComparisonItem,
)
from .utils import build_search_params, html_to_text, map_vacancy_detail, map_vacancy_item

logger = get_logger("vacancies.service")
HH_TOKEN_CACHE_KEY = "hh:app_token"
EXCLUDED_IT_ROLE_IDS = {"10", "12", "34", "73", "107", "148", "150", "155", "157", "164"}
IT_ROLE_CACHE_KEY = (
    "hh:it_professional_roles:"
    + hashlib.sha1(",".join(sorted(EXCLUDED_IT_ROLE_IDS)).encode("utf-8")).hexdigest()[:10]
)


def token_fingerprint(token: str | None) -> str:
    if not token:
        return "none"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:10]


def response_preview(response: httpx.Response) -> str:
    text = response.text.replace("\n", " ").strip()
    return text[:1000]


def is_unrecognized_authorization(response: httpx.Response) -> bool:
    return "unrecognized authorization" in response.text.lower()


class VacanciesService:
    VACANCY_ID_PATTERN = re.compile(r"(?:hh\.ru/vacancy/|/vacancies/|^)(\d+)")

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
            if isinstance(item, dict) and not self._has_excluded_professional_role(item)
        ]

        return VacancySearchResponse(
            items=mapped_items,
            found=int(response_payload.get("found") or 0),
        )

    async def analyze_vacancy(
        self,
        db: AsyncSession,
        user_id: int,
        payload: AnalyzeVacancyRequest,
    ) -> VacancyAnalysisResponse:
        vacancy_id = self.extract_vacancy_id(payload.url)
        vacancy_payload = await self.fetch_vacancy_detail(vacancy_id)
        await self._ensure_it_vacancy(vacancy_payload)
        vacancy = await self._upsert_vacancy(db, vacancy_payload)
        db.add(VacancyHistory(user_id=user_id, vacancy_id=vacancy.id))
        await db.flush()

        has_skills = await self._has_vacancy_skills(db, vacancy.id)
        if vacancy.analyzed_at is not None and has_skills:
            await db.commit()
            return await self.build_analysis_response(db, user_id, vacancy.id, vacancy_payload, is_queued=False)

        if vacancy.analyzed_at is not None and not has_skills:
            vacancy.analyzed_at = None

        await db.commit()

        from ..celery.tasks import analyze_vacancy_task
        analyze_vacancy_task.delay(
            user_id=user_id,
            vacancy_id=vacancy.id,
            title=vacancy.title,
            description=self.build_vacancy_analysis_payload(vacancy_payload),
        )

        return await self.build_analysis_response(db, user_id, vacancy.id, vacancy_payload, is_queued=True)

    async def get_analysis(self, db: AsyncSession, user_id: int, vacancy_id: int) -> VacancyAnalysisResponse:
        vacancy = await db.get(Vacancy, vacancy_id)
        if vacancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Вакансия не найдена")

        vacancy_payload = None
        try:
            vacancy_payload = await self.fetch_vacancy_detail(vacancy.id)
        except HTTPException:
            vacancy_payload = None

        return await self.build_analysis_response(db, user_id, vacancy.id, vacancy_payload, is_queued=False)

    async def build_analysis_response(
        self,
        db: AsyncSession,
        user_id: int,
        vacancy_id: int,
        vacancy_payload: dict[str, Any] | None = None,
        is_queued: bool = False,
    ) -> VacancyAnalysisResponse:
        vacancy = await db.get(Vacancy, vacancy_id)
        if vacancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Вакансия не найдена")

        vacancy_item = map_vacancy_detail(vacancy_payload) if vacancy_payload else VacancySearchItem(
            id=str(vacancy.id),
            title=vacancy.title,
            salary_text="ЗП не указана",
            tags=[],
            employer_name="Не указан",
            original_url=vacancy.url,
        )

        comparisons = await self._build_skill_comparisons(db, user_id, vacancy_id)
        gaps = [
            {
                "skill_id": item.skill_id,
                "skill_name": item.skill_name,
                "current_order_index": item.current_order_index,
                "required_order_index": item.required_order_index,
                "current_level_name": item.current_level_name,
                "required_level_name": item.required_level_name,
            }
            for item in comparisons
            if not item.is_satisfied and item.required_order_index is not None
        ]
        recommendation_items = await RecommendationService(db).build_skill_gap_recommendations(user_id, gaps, limit=5)
        recommendations = self._map_vacancy_recommendations(recommendation_items, gaps)

        return VacancyAnalysisResponse(
            vacancy=vacancy_item,
            analyzed_at=vacancy.analyzed_at,
            is_analyzed=vacancy.analyzed_at is not None and len(comparisons) > 0,
            is_queued=is_queued,
            skills=comparisons,
            recommendations=recommendations,
        )

    async def _has_vacancy_skills(self, db: AsyncSession, vacancy_id: int) -> bool:
        skill_id = await db.scalar(
            select(VacancySkill.id)
            .where(VacancySkill.vacancy_id == vacancy_id)
            .limit(1)
        )
        return skill_id is not None

    def extract_vacancy_id(self, value: str) -> int:
        normalized = value.strip()
        match = self.VACANCY_ID_PATTERN.search(normalized)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Укажите корректную ссылку",
            )
        return int(match.group(1))

    async def fetch_vacancy_detail(self, vacancy_id: int) -> dict[str, Any]:
        payload = await self._fetch_hh_json(f"/vacancies/{vacancy_id}")
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул неожиданный ответ по вакансии",
            )
        return payload

    async def _ensure_it_vacancy(self, payload: dict[str, Any]):
        allowed_role_ids = set(await self.get_it_professional_roles())
        vacancy_role_ids = self._extract_professional_role_ids(payload)
        if (
            not vacancy_role_ids
            or self._has_excluded_professional_role(payload)
            or vacancy_role_ids.isdisjoint(allowed_role_ids)
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Вакансия найдена, но не относится к сфере ИТ",
            )

    async def _upsert_vacancy(self, db: AsyncSession, payload: dict[str, Any]) -> Vacancy:
        raw_id = payload.get("id")
        try:
            vacancy_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="HeadHunter вернул вакансию без идентификатора",
            ) from exc

        vacancy = await db.get(Vacancy, vacancy_id)
        title = str(payload.get("name") or "Без названия")
        url = str(payload.get("alternate_url") or payload.get("url") or f"https://hh.ru/vacancy/{vacancy_id}")
        if vacancy is None:
            vacancy = Vacancy(id=vacancy_id, title=title, url=url)
            db.add(vacancy)
        else:
            vacancy.title = title
            vacancy.url = url
        return vacancy

    def build_vacancy_analysis_payload(self, payload: dict[str, Any]) -> str:
        parts = [
            str(payload.get("name") or ""),
            html_to_text(str(payload.get("description") or "")),
        ]
        for key in ("key_skills", "professional_roles"):
            values = [
                str(item.get("name") or "").strip()
                for item in payload.get(key) or []
                if isinstance(item, dict) and str(item.get("name") or "").strip()
            ]
            if values:
                parts.append(", ".join(values))
        return "\n\n".join(part for part in parts if part.strip())

    async def _build_skill_comparisons(
        self,
        db: AsyncSession,
        user_id: int,
        vacancy_id: int,
    ) -> list[VacancySkillComparisonItem]:
        result = await db.execute(
            select(
                VacancySkill.id,
                VacancySkill.skill_id,
                VacancySkill.score,
                Skill.name.label("skill_name"),
            )
            .join(Skill, VacancySkill.skill_id == Skill.id)
            .where(VacancySkill.vacancy_id == vacancy_id, VacancySkill.skill_id.isnot(None))
            .order_by(VacancySkill.score.desc(), Skill.name)
        )
        rows = result.all()
        if not rows:
            return []

        profiles = await RecommendationService(db)._load_skill_profiles(user_id)
        skill_ids = [row.skill_id for row in rows]
        levels_result = await db.execute(
            select(
                SkillLevel.id,
                SkillLevel.skill_id,
                SkillLevel.order_index,
                Level.name.label("level_name"),
            )
            .join(Level, SkillLevel.level_id == Level.id)
            .where(SkillLevel.skill_id.in_(skill_ids))
            .order_by(SkillLevel.skill_id, SkillLevel.order_index, SkillLevel.id)
        )
        levels_by_skill: dict[int, list[Any]] = {}
        level_name_by_id: dict[int, str] = {}
        for level in levels_result.all():
            levels_by_skill.setdefault(level.skill_id, []).append(level)
            level_name_by_id[level.id] = level.level_name

        items: list[VacancySkillComparisonItem] = []
        for row in rows:
            levels = levels_by_skill.get(row.skill_id, [])
            required_level = None
            if levels:
                required_index = get_level_index_normal(row.score, len(levels))
                required_level = levels[required_index]

            profile = profiles.get(row.skill_id)
            current_level_name = None
            current_order_index = None
            if profile:
                current_level_name = level_name_by_id.get(profile.current_skill_level_id)
                current_order_index = profile.current_order_index

            required_order_index = required_level.order_index if required_level else None
            is_satisfied = (
                current_order_index is not None
                and required_order_index is not None
                and current_order_index >= required_order_index
            )

            items.append(VacancySkillComparisonItem(
                id=row.id,
                skill_id=row.skill_id,
                skill_name=row.skill_name,
                current_level_name=current_level_name,
                current_order_index=current_order_index,
                required_level_name=required_level.level_name if required_level else None,
                required_order_index=required_order_index,
                required_score=row.score,
                is_satisfied=is_satisfied,
            ))
        return items

    def _map_vacancy_recommendations(self, items: list[Any], gaps: list[dict]) -> list[VacancyAnalysisRecommendation]:
        recommendations: list[VacancyAnalysisRecommendation] = []
        for item in items:
            skill_names = {skill.skill_name for skill in item.skill_levels}
            gap = next((candidate for candidate in gaps if candidate["skill_name"] in skill_names), None)
            if not gap:
                continue
            recommendations.append(VacancyAnalysisRecommendation(
                id=item.id,
                content_type=item.content_type,
                target_id=item.target_id,
                title=item.title,
                description=item.description,
                skill_name=gap["skill_name"],
                current_level_name=gap["current_level_name"],
                required_level_name=gap["required_level_name"],
            ))
        return recommendations

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
            if not role_id or not role_name or role_id in seen_ids or role_id in EXCLUDED_IT_ROLE_IDS:
                continue
            seen_ids.add(role_id)
            normalized_items.append({"id": role_id, "name": role_name})

        return normalized_items

    def _extract_professional_role_ids(self, payload: dict[str, Any]) -> set[str]:
        return {
            str(role.get("id") or "").strip()
            for role in payload.get("professional_roles") or []
            if isinstance(role, dict) and str(role.get("id") or "").strip()
        }

    def _has_excluded_professional_role(self, payload: dict[str, Any]) -> bool:
        return not self._extract_professional_role_ids(payload).isdisjoint(EXCLUDED_IT_ROLE_IDS)

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

    async def _get_app_token(self) -> str | None:
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
        if VacanciesService._in_memory_token and VacanciesService._in_memory_expires_at > now:
            logger.debug(
                "HH token source=in-memory fp=%s expires_in=%s",
                token_fingerprint(VacanciesService._in_memory_token),
                int(VacanciesService._in_memory_expires_at - now),
            )
            return VacanciesService._in_memory_token

        # проверка redis
        redis = get_redis()
        try:
            token = await redis.get(HH_TOKEN_CACHE_KEY)
            if token:
                # обновление in-memory кэша
                ttl = await redis.ttl(HH_TOKEN_CACHE_KEY)
                logger.debug(
                    "HH token source=redis fp=%s ttl=%s",
                    token_fingerprint(token),
                    ttl,
                )
                if ttl > 0:
                    VacanciesService._in_memory_token = token
                    VacanciesService._in_memory_expires_at = now + ttl
                return token
        except Exception as exc:
            logger.warning("не удалось прочитать токен из redis: %s", exc)

        return None

    async def _fetch_new_token(self) -> str | None:
        # проверка настроек
        if not global_config.HH_CLIENT_ID or not global_config.HH_CLIENT_SECRET:
            logger.warning("не заданы HH_CLIENT_ID или HH_CLIENT_SECRET, HH-запрос будет выполнен без Authorization")
            return None

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
            if response.status_code == 403 and "app token refresh too early" in response.text.lower():
                logger.error(
                    "hh.ru отклонил refresh app-token как слишком ранний, анонимный HH-запрос отменён: body=%s",
                    response_preview(response),
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="HeadHunter не разрешил обновить app-token до истечения текущего токена",
                )
            logger.error(
                "hh.ru отклонил запрос токена: status=%s body=%s",
                response.status_code,
                response_preview(response),
            )
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
        logger.debug(
            "HH token source=fetched fp=%s expires_in=%s",
            token_fingerprint(access_token),
            expires_in,
        )

        # сохранение в redis
        ttl = max(1, expires_in)
        try:
            redis = get_redis()
            await redis.setex(HH_TOKEN_CACHE_KEY, ttl, access_token)
        except Exception as exc:
            logger.warning("не удалось сохранить токен в redis: %s", exc)

        return access_token

    async def _clear_cached_token(self):
        VacanciesService._in_memory_token = None
        VacanciesService._in_memory_expires_at = 0.0
        try:
            redis = get_redis()
            await redis.delete(HH_TOKEN_CACHE_KEY)
            logger.warning("HH token cache cleared after authorization error")
        except Exception as exc:
            logger.warning("не удалось очистить HH token cache: %s", exc)

    async def _fetch_hh_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        token = await self._get_app_token()
        base_headers = {
            "User-Agent": global_config.HH_API_USER_AGENT,
            "HH-User-Agent": global_config.HH_API_USER_AGENT,
            "Accept": "application/json",
        }
        request_headers = dict(base_headers)
        if token:
            request_headers["Authorization"] = f"Bearer {token}"

        try:
            async with httpx.AsyncClient(
                base_url=global_config.HH_API_BASE_URL,
                headers=base_headers,
            ) as client:
                logger.debug(
                    "HH request path=%s params=%s auth=%s token_fp=%s",
                    path,
                    params,
                    "yes" if token else "no",
                    token_fingerprint(token),
                )
                response = await client.get(path, params=params, headers=request_headers)
                if token and response.status_code >= 400 and is_unrecognized_authorization(response):
                    logger.error(
                        "HH authorization rejected: path=%s status=%s token_fp=%s body=%s",
                        path,
                        response.status_code,
                        token_fingerprint(token),
                        response_preview(response),
                    )
                    await self._clear_cached_token()
                    logger.debug("HH retry without Authorization path=%s params=%s", path, params)
                    response = await client.get(path, params=params, headers=base_headers)
        except httpx.HTTPError as exc:
            logger.warning("Не удалось выполнить запрос к HeadHunter: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось получить данные из HeadHunter",
            ) from exc

        if response.status_code >= 400:
            logger.error(
                "HeadHunter вернул ошибку: status=%s path=%s params=%s body=%s",
                response.status_code,
                path,
                params,
                response_preview(response),
            )
            if path.startswith("/vacancies/") and response.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Не удалось найти вакансию, убедитесь в корректности указанной ссылки",
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
