import re

from pydantic import BaseModel, Field, field_validator, model_validator

_USERNAME_RE = re.compile(r'^[a-zA-Zа-яА-ЯёЁ_-]+$')
USERNAME_MAX_LENGTH = 16

# простая проверка формата email
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')


class LoginCredentials(BaseModel):
    identifier: str = Field(max_length=64)
    password: str = Field(max_length=64)


class RegistrationCredentials(BaseModel):
    username: str
    email: str = Field(max_length=64)
    password: str = Field(max_length=64)
    github_token: str | None = None
    github_id: int | None = None

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        return validate_username_value(v)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return validate_email_value(v)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_value(v)


class EmailConfirmationRequest(BaseModel):
    email: str = Field(max_length=64)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return validate_email_value(v)


class EmailConfirmationResponse(BaseModel):
    message: str
    retry_after_seconds: int = 0


class EmailConfirmationVerifyResponse(BaseModel):
    email: str
    invitation_role: str | None = None


class EmailRegistrationCompleteRequest(BaseModel):
    code: str
    username: str
    email: str = Field(max_length=64)
    password: str = Field(max_length=64)
    repeat_password: str = Field(max_length=64)

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        return validate_username_value(v)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return validate_email_value(v)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_value(v)

    @model_validator(mode="after")
    def validate_repeated_password(self):
        if self.password != self.repeat_password:
            raise ValueError('Пароли не совпадают')
        return self


class EmailChangeNewAddressRequest(BaseModel):
    code: str
    email: str = Field(max_length=64)

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return validate_email_value(v)


class EmailChangeConfirmRequest(BaseModel):
    code: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


class UsernameAvailabilityResponse(BaseModel):
    available: bool


class UsernameUpdateRequest(BaseModel):
    username: str

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        return validate_username_value(v)


class ContentOwnerItem(BaseModel):
    id: int
    username: str


class ContentOwnerSearchResponse(BaseModel):
    items: list[ContentOwnerItem]


class AuthResponse(BaseModel):
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


def validate_username_value(value: str) -> str:
    if len(value) < 4 or len(value) > USERNAME_MAX_LENGTH:
        raise ValueError('Имя пользователя должно содержать от 4 до 16 символов')
    if not _USERNAME_RE.match(value):
        raise ValueError('Имя пользователя может содержать только латиницу, кириллицу, символы "-" и "_"')
    return value


def validate_email_value(value: str) -> str:
    if not _EMAIL_RE.match(value):
        raise ValueError('Некорректный адрес электронной почты')
    return value


def validate_password_value(value: str) -> str:
    if len(value) < 12 or len(value) > 32:
        raise ValueError('Пароль должен содержать от 12 до 32 символов')
    if not any(c.isdigit() for c in value):
        raise ValueError('Пароль должен содержать хотя бы одну цифру')
    if not any(not c.isalnum() for c in value):
        raise ValueError('Пароль должен содержать хотя бы один специальный символ')
    if not any(c.islower() for c in value) or not any(c.isupper() for c in value):
        raise ValueError('Пароль должен содержать минимум две буквы в разных регистрах')
    return value
