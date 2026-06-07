from pydantic import BaseModel


class AnalyzeRepoRequest(BaseModel):
    gh_id: int | None = None
    repo_name: str
    repo_url: str
    last_commit_date: str | None = None
    task_id: int | None = None
