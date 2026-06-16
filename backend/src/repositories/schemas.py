from pydantic import BaseModel


class GitHubAuthorizationUrlResponse(BaseModel):
    authorization_url: str


class GitHubProfileResponse(BaseModel):
    connected: bool
    login: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    profile_url: str | None = None


class GitHubDisconnectResponse(BaseModel):
    message: str


class AnalyzeRepoRequest(BaseModel):
    gh_id: int | None = None
    repo_name: str
    repo_url: str
    last_commit_date: str | None = None
    task_id: int | None = None
