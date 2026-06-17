import pytest
from pydantic import ValidationError

from src.classifier.schemas import ProfStandardCreateUpdate, PsFunctionCreateUpdate
from src.classifier.schemas import PsFunctionsGroupCreateUpdate


def test_classifier_schema_boundaries():
    assert ProfStandardCreateUpdate(code=6, name="ПС").code == 6
    assert PsFunctionsGroupCreateUpdate(code="A", name="ОТФ", qualification_level=9)
    assert PsFunctionCreateUpdate(code=99, name="ТФ").code == 99


def test_classifier_schema_rejects_invalid_boundaries():
    with pytest.raises(ValidationError):
        ProfStandardCreateUpdate(code=1000, name="ПС")
    with pytest.raises(ValidationError):
        PsFunctionsGroupCreateUpdate(code="AA", name="ОТФ", qualification_level=1)
    with pytest.raises(ValidationError):
        PsFunctionCreateUpdate(code=0, name="ТФ")
