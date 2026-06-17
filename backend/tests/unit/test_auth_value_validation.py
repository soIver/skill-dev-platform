import pytest

from src.auth.schemas import validate_email_value, validate_password_value


@pytest.mark.parametrize(
    "password",
    ["Short1!", "passwordWithoutDigit!", "PasswordWithoutSpecial1", "lowercasepass1!"],
)
def test_validate_password_value_rejects_weak_passwords(password):
    with pytest.raises(ValueError):
        validate_password_value(password)


@pytest.mark.parametrize("email", ["bad-email", "user@localhost", "user@.ru"])
def test_validate_email_value_rejects_invalid_emails(email):
    with pytest.raises(ValueError):
        validate_email_value(email)
