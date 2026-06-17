from src.vacancies.utils import flatten_area_leaves


def test_flatten_area_leaves_returns_sorted_full_names():
    payload = [
        {
            "id": "1",
            "name": "Россия",
            "areas": [
                {"id": "2", "name": "Москва", "areas": []},
                {"id": "3", "name": "Санкт-Петербург", "areas": []},
            ],
        },
        {"id": "4", "name": "Беларусь", "areas": []},
    ]

    assert flatten_area_leaves(payload) == [
        {"id": "4", "name": "Беларусь", "full_name": "Беларусь"},
        {"id": "2", "name": "Москва", "full_name": "Россия / Москва"},
        {"id": "3", "name": "Санкт-Петербург", "full_name": "Россия / Санкт-Петербург"},
    ]
