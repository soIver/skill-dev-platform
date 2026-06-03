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
