import re
from typing import Any

from .schemas import VacancySearchItem, VacancySearchRequest


def flatten_area_leaves(areas_payload: list[dict[str, Any]]) -> list[dict[str, str]]:
    leaves: list[dict[str, str]] = []

    def visit(area: dict[str, Any], parents: list[str]):
        area_name = str(area.get("name") or "").strip()
        area_id = str(area.get("id") or "").strip()
        nested_areas = area.get("areas") or []
        lineage = [*parents, area_name] if area_name else parents

        if nested_areas:
            for child_area in nested_areas:
                visit(child_area, lineage)
            return

        if not area_id or not area_name:
            return

        leaves.append(
            {
                "id": area_id,
                "name": area_name,
                "full_name": " / ".join(lineage),
            }
        )

    for area in areas_payload:
        visit(area, [])

    return sorted(leaves, key=lambda item: item["full_name"].lower())


def build_search_params(payload: VacancySearchRequest, it_roles: list[str]) -> dict[str, Any]:
    params: dict[str, Any] = {
        "per_page": 20,
        "order_by": "relevance",
        "page": payload.page,
    }

    if it_roles:
        params["professional_role"] = it_roles
    if payload.description:
        params["text"] = payload.description
    if payload.excluded_words:
        params["excluded_text"] = payload.excluded_words
    if payload.salary_range:
        params["salary_range"] = payload.salary_range.model_dump_json(exclude_none=True, by_alias=True)
    if payload.only_with_salary:
        params["only_with_salary"] = "true"
    if payload.area_ids:
        params["area"] = payload.area_ids
    if payload.experience:
        params["experience"] = payload.experience
    if payload.schedule:
        params["schedule"] = payload.schedule
    if payload.education:
        params["education"] = payload.education
    if payload.accredited_it_employer:
        params["label"] = "accredited_it"
    if payload.less_than_10_negotiations:
        params["parttime"] = "less_than_10_negotiations"

    return params


def map_vacancy_item(item: dict[str, Any]) -> VacancySearchItem:
    employer = item.get("employer") or {}

    return VacancySearchItem(
        id=str(item.get("id") or ""),
        title=str(item.get("name") or "Без названия"),
        salary_text=format_salary(item.get("salary")),
        tags=collect_tags(item),
        employer_name=str(employer.get("name") or "Не указан"),
        original_url=str(item.get("alternate_url") or item.get("url") or ""),
    )


def map_vacancy_detail(item: dict[str, Any]) -> VacancySearchItem:
    employer = item.get("employer") or {}

    return VacancySearchItem(
        id=str(item.get("id") or ""),
        title=str(item.get("name") or "Без названия"),
        salary_text=format_salary(item.get("salary")),
        tags=collect_tags(item),
        employer_name=str(employer.get("name") or "Не указан"),
        original_url=str(item.get("alternate_url") or item.get("url") or ""),
    )


def html_to_text(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def format_salary(salary: dict[str, Any] | None) -> str:
    if not salary:
        return "ЗП не указана"

    salary_from = salary.get("from")
    salary_to = salary.get("to")
    currency = get_currency_symbol(salary.get("currency"))
    gross = salary.get("gross")

    if salary_from is not None and salary_to is not None:
        amount = f"от {format_amount(salary_from)} до {format_amount(salary_to)} {currency}"
    elif salary_from is not None:
        amount = f"от {format_amount(salary_from)} {currency}"
    elif salary_to is not None:
        amount = f"до {format_amount(salary_to)} {currency}"
    else:
        amount = f"доход не указан в {currency}"

    tax_label = ""
    if gross is True:
        tax_label = " до вычета налогов"
    elif gross is False:
        tax_label = " на руки"

    return f"{amount} {tax_label}"


def format_amount(value: Any) -> str:
    try:
        return f"{int(value):,}".replace(",", " ")
    except (TypeError, ValueError):
        return str(value)


def get_currency_symbol(currency_code: Any) -> str:
    currency_map = {
        "RUR": "₽",
        "RUB": "₽",
        "USD": "$",
        "EUR": "€",
        "KZT": "₸",
        "UZS": "сум",
        "BYR": "Br",
        "BYN": "Br",
    }
    normalized_currency = str(currency_code or "").upper()
    return currency_map.get(normalized_currency, normalized_currency or "у.е.")


def collect_tags(item: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    seen_tags: set[str] = set()

    for field_name in ("experience", "schedule", "employment"):
        add_named_tag(item.get(field_name), tags, seen_tags)

    for field_name in ("work_format", "working_days", "working_time_intervals", "working_time_modes"):
        for value in item.get(field_name) or []:
            add_named_tag(value, tags, seen_tags)

    return tags


def add_named_tag(source: Any, tags: list[str], seen_tags: set[str]):
    if not isinstance(source, dict):
        return

    tag_name = str(source.get("name") or "").strip()
    if not tag_name:
        return

    normalized_name = tag_name.lower()
    if normalized_name in seen_tags:
        return

    seen_tags.add(normalized_name)
    tags.append(tag_name)
