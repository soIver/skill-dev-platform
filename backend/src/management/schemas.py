from pydantic import BaseModel, Field, field_validator

from ..auth.schemas import validate_email_value


class CuratorInvitationRequest(BaseModel):
    email: str = Field(max_length=64)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email_value(value)


class CuratorInvitationAvailabilityResponse(BaseModel):
    can_invite: bool
    reason: str | None = None


class CuratorManagementItem(BaseModel):
    id: int | str
    kind: str
    username: str | None = None
    email: str
    role: str | None = None
    tests_count: int | None = None
    skills_count: int | None = None
    tasks_count: int | None = None


class CuratorManagementResponse(BaseModel):
    items: list[CuratorManagementItem]
    total_pages: int
    current_page: int


class CuratorInvitationConfirmRequest(BaseModel):
    code: str


class CuratorInvitationConfirmResponse(BaseModel):
    message: str
