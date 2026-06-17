from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from redis.asyncio import from_url as redis_from_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.vacancies.utils import html_to_text


# сюда можно вставить ссылку на вакансию, если не хотите передавать её аргументом
VACANCY_URL = "https://hh.ru/vacancy/133532967"

VACANCY_ID_PATTERN = re.compile(r"(?:hh\.ru/vacancy/|/vacancies/|^)(\d+)")
HH_API_BASE_URL = "https://api.hh.ru"
HH_TOKEN_CACHE_KEY = "hh:app_token"


def load_env():
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(BACKEND_DIR / "src" / ".env")


def extract_vacancy_id(value: str) -> str:
    match = VACANCY_ID_PATTERN.search(value.strip())
    if not match:
        raise ValueError("Не удалось извлечь id вакансии из ссылки")
    return match.group(1)


def get_user_agent() -> str:
    configured = os.getenv("HH_API_USER_AGENT")
    if configured:
        return configured
    admin_email = os.getenv("ADMIN_EMAIL") or "local"
    return f"skill-dev-platform-role-check/1.0 ({admin_email})"


async def get_app_token_from_redis() -> str | None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        print("REDIS_URL не задан, запрос вакансии пойдёт без Authorization")
        return None

    redis = redis_from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    try:
        token = await redis.get(HH_TOKEN_CACHE_KEY)
        ttl = await redis.ttl(HH_TOKEN_CACHE_KEY)
    finally:
        await redis.aclose()

    if not token:
        print(f"В Redis нет ключа {HH_TOKEN_CACHE_KEY}, запрос вакансии пойдёт без Authorization")
        return None

    print(f"Токен взят из Redis: key={HH_TOKEN_CACHE_KEY}, ttl={ttl}")
    return token


def extract_hh_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"HeadHunter вернул HTTP {response.status_code}"

    if isinstance(payload, dict):
        description = payload.get("description")
        if description:
            return str(description)

        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first_error = errors[0]
            if isinstance(first_error, dict):
                return str(first_error.get("description") or first_error.get("type") or payload)

    return f"HeadHunter вернул HTTP {response.status_code}"


async def fetch_vacancy(vacancy_id: str) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": get_user_agent(),
        "HH-User-Agent": get_user_agent(),
    }
    token = await get_app_token_from_redis()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(base_url=HH_API_BASE_URL, headers=headers, timeout=20) as client:
        response = await client.get(f"/vacancies/{vacancy_id}", headers=headers)

    if response.status_code == 404:
        raise RuntimeError("Не удалось найти вакансию, убедитесь в корректности указанной ссылки")
    if response.status_code >= 400:
        raise RuntimeError(f"Ошибка HeadHunter: {extract_hh_error(response)}")

    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("HeadHunter вернул неожиданный ответ")
    return payload


def print_roles(payload: dict[str, Any]):
    vacancy_id = payload.get("id") or "?"
    vacancy_name = payload.get("name") or "Без названия"
    print(f"Вакансия: {vacancy_id} — {vacancy_name}")

    roles = payload.get("professional_roles") or []
    if not roles:
        print("Роли вакансии не указаны")
        return

    print("Роли вакансии:")
    for role in roles:
        if not isinstance(role, dict):
            continue
        role_id = role.get("id") or "?"
        role_name = role.get("name") or "Без названия"
        print(f"- {role_id} — {role_name}")


def build_vacancy_analysis_payload(payload: dict[str, Any]) -> str:
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


def print_description(payload: dict[str, Any]):
    description = html_to_text(str(payload.get("description") or ""))
    print("\nОписание вакансии:")
    print(description or "Описание не указано")

    print("\nТекст, который уйдёт в анализ:")
    print(build_vacancy_analysis_payload(payload) or "Нет данных для анализа")


async def main():
    load_env()
    vacancy_url = sys.argv[1].strip() if len(sys.argv) > 1 else VACANCY_URL.strip()
    if not vacancy_url:
        raise SystemExit(
            "Укажите ссылку аргументом или вставьте её в VACANCY_URL внутри файла"
        )

    vacancy_id = extract_vacancy_id(vacancy_url)
    payload = await fetch_vacancy(vacancy_id)
    print_roles(payload)
    print_description(payload)


if __name__ == "__main__":
    asyncio.run(main())
