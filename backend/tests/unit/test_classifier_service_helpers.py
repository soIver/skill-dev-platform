import pytest
from fastapi import HTTPException

from src.classifier.service import group_code_by_index, normalize_group_code, validate_name


def test_normalize_group_code_accepts_latin_and_similar_cyrillic_letters():
    assert normalize_group_code(" a ") == "A"
    assert normalize_group_code("В") == "B"
    assert normalize_group_code("х") == "X"


@pytest.mark.parametrize("code", ["", "AA", "1", "Я"])
def test_normalize_group_code_rejects_invalid_values(code):
    with pytest.warns(DeprecationWarning), pytest.raises(HTTPException) as error:
        normalize_group_code(code)

    assert error.value.status_code == 422


def test_validate_name_trims_and_rejects_empty_or_too_long_names():
    assert validate_name("  Название  ") == "Название"

    with pytest.warns(DeprecationWarning), pytest.raises(HTTPException):
        validate_name("   ")
    with pytest.warns(DeprecationWarning), pytest.raises(HTTPException):
        validate_name("x" * 257)


def test_group_code_by_index_maps_zero_based_index_to_letter():
    assert group_code_by_index(0) == "A"
    assert group_code_by_index(25) == "Z"

    with pytest.warns(DeprecationWarning), pytest.raises(HTTPException):
        group_code_by_index(26)
