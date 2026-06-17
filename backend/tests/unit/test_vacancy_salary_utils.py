import pytest

from src.vacancies.utils import format_salary, html_to_text


@pytest.mark.parametrize(
    ("salary", "expected"),
    [
        (None, "ЗП не указана"),
        ({"from": None, "to": None, "currency": "USD"}, "доход не указан в $"),
        (
            {"from": 100000, "to": 180000, "currency": "RUR", "gross": True},
            "от 100 000 до 180 000 ₽ до вычета налогов",
        ),
    ],
)
def test_format_salary_handles_empty_and_range_values(salary, expected):
    assert format_salary(salary) == expected


def test_html_to_text_removes_tags_and_preserves_content():
    assert html_to_text("<p>Python<br>FastAPI</p><strong>SQL</strong>") == "Python FastAPI SQL"
