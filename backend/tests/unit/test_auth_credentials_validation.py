import pytest
from pydantic import ValidationError

from src.auth.schemas import EmailRegistrationCompleteRequest, UsernameUpdateRequest


def test_email_registration_complete_request_accepts_valid_credentials():
    payload = EmailRegistrationCompleteRequest(
        code="mail-code",
        username="Иван_test",
        email="ivan@example.com",
        password="StrongPass1!",
        repeat_password="StrongPass1!",
    )

    assert payload.username == "Иван_test"
    assert payload.email == "ivan@example.com"


@pytest.mark.parametrize("username", ["abc", "user with space", "toolongusername_123", "name!"])
def test_username_update_request_rejects_invalid_usernames(username):
    with pytest.raises(ValidationError):
        UsernameUpdateRequest(username=username)


def test_email_registration_complete_request_requires_matching_passwords():
    with pytest.raises(ValidationError):
        EmailRegistrationCompleteRequest(
            code="mail-code",
            username="valid_user",
            email="valid@example.com",
            password="StrongPass1!",
            repeat_password="StrongPass2!",
        )
