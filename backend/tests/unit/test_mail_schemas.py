import pytest

from src.mail.schemas import PasswordChangeConfirmRequest


def test_password_change_confirm_request_validates_new_password_and_repeat():
    payload = PasswordChangeConfirmRequest(
        code="code",
        current_password="OldStrong1!",
        new_password="NewStrong123!",
        repeat_password="NewStrong123!",
    )

    assert payload.new_password == "NewStrong123!"

    with pytest.raises(ValueError):
        PasswordChangeConfirmRequest(
            code="code",
            current_password="OldStrong1!",
            new_password="weak",
            repeat_password="weak",
        )

    with pytest.raises(ValueError):
        PasswordChangeConfirmRequest(
            code="code",
            current_password="OldStrong1!",
            new_password="NewStrong123!",
            repeat_password="NewStrong124!",
        )
