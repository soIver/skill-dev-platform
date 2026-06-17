from urllib.parse import parse_qs, urlparse

from src.repositories.schemas import AnalyzeRepoRequest
from src.repositories.utils import build_github_authorization_url


def test_build_github_authorization_url_contains_oauth_pkce_parameters(monkeypatch):
    monkeypatch.setattr("src.repositories.utils.global_config.GITHUB_CLIENT_ID", "client-id")
    monkeypatch.setattr("src.repositories.utils.global_config.GITHUB_REDIRECT_URI", "http://localhost/callback")

    url = build_github_authorization_url("state-value", "challenge-value")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "github.com"
    assert parsed.path == "/login/oauth/authorize"
    assert query["client_id"] == ["client-id"]
    assert query["redirect_uri"] == ["http://localhost/callback"]
    assert query["state"] == ["state-value"]
    assert query["code_challenge"] == ["challenge-value"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["allow_signup"] == ["true"]


def test_analyze_repo_request_accepts_task_repository_payload():
    payload = AnalyzeRepoRequest(
        gh_id=123,
        repo_name="skill-dev-platform",
        repo_url="https://github.com/example/skill-dev-platform",
        last_commit_date="2026-06-17T10:00:00Z",
        task_id=55,
    )

    assert payload.gh_id == 123
    assert payload.task_id == 55
