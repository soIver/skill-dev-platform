from src.config import Config


def test_config_string_encryption_key_is_fernet_sized(monkeypatch):
    monkeypatch.setattr(Config, "STRING_ENCRYPTION_SECRET", "secret")

    assert len(Config.string_encryption_key()) == 44


def test_config_auth_cookie_secure_depends_on_allowed_origins(monkeypatch):
    monkeypatch.setattr(Config, "ALLOWED_ORIGINS", ["http://localhost:5173"])
    assert Config.auth_cookie_secure() is False

    monkeypatch.setattr(Config, "ALLOWED_ORIGINS", ["https://it-skill-dev.ru"])
    assert Config.auth_cookie_secure() is True


def test_normalize_api_route_prefix_accepts_empty_root_and_api_prefix():
    assert Config._normalize_api_route_prefix(None) == ""
    assert Config._normalize_api_route_prefix("") == ""
    assert Config._normalize_api_route_prefix("/") == ""
    assert Config._normalize_api_route_prefix("api") == "/api"
    assert Config._normalize_api_route_prefix("/api/") == "/api"


def test_frontend_url_joins_base_url_and_path(monkeypatch):
    config = Config()
    monkeypatch.setattr(config, "FRONTEND_BASE_URL", "https://app.example.com/")

    assert config.frontend_url() == "https://app.example.com"
    assert config.frontend_url("/account/credentials") == "https://app.example.com/account/credentials"
    assert config.frontend_url("auth/login") == "https://app.example.com/auth/login"


def test_config_validate_returns_false_when_required_values_are_missing(monkeypatch):
    monkeypatch.setattr(Config, "DATABASE_URL", None)

    assert Config.validate() is False
