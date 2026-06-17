from src.config import Config


def test_config_string_encryption_key_is_fernet_sized(monkeypatch):
    monkeypatch.setattr(Config, "STRING_ENCRYPTION_SECRET", "secret")

    assert len(Config.string_encryption_key()) == 44


def test_config_auth_cookie_secure_depends_on_allowed_origins(monkeypatch):
    monkeypatch.setattr(Config, "ALLOWED_ORIGINS", ["http://localhost:5173"])
    assert Config.auth_cookie_secure() is False

    monkeypatch.setattr(Config, "ALLOWED_ORIGINS", ["https://it-skill-dev.ru"])
    assert Config.auth_cookie_secure() is True


def test_config_validate_returns_false_when_required_values_are_missing(monkeypatch):
    monkeypatch.setattr(Config, "DATABASE_URL", None)

    assert Config.validate() is False
