from src.vacancies.utils import map_vacancy_item


def test_map_vacancy_item_formats_salary_and_deduplicates_tags():
    item = {
        "id": 123,
        "name": "Backend developer",
        "salary": {"from": 200000, "currency": "RUR", "gross": False},
        "employer": {"name": "Skill Dev"},
        "alternate_url": "https://hh.ru/vacancy/123",
        "experience": {"name": "1-3 года"},
        "schedule": {"name": "Удаленная работа"},
        "working_time_modes": [{"name": "Удаленная работа"}],
    }

    result = map_vacancy_item(item)

    assert result.id == "123"
    assert result.title == "Backend developer"
    assert result.salary_text == "от 200 000 ₽ на руки"
    assert result.employer_name == "Skill Dev"
    assert result.original_url == "https://hh.ru/vacancy/123"
    assert result.tags == ["1-3 года", "Удаленная работа"]
