from pydantic import BaseModel

class AnalyzeRepoRequest(BaseModel):
    repo_name: str
    repo_url: str