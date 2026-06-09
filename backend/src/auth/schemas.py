import re

from pydantic import BaseModel, Field, field_validator

_USERNAME_RE = re.compile(r'^[a-zA-Zа-яА-ЯёЁ_-]+$')

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
        if len(v) < 4 or len(v) > 32:
            raise ValueError('Имя пользователя должно содержать от 4 до 32 символов')
        if not _USERNAME_RE.match(v):
            raise ValueError('Имя пользователя может содержать только латиницу, кириллицу, символы "-" и "_"')
        return v

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError('Некорректный адрес электронной почты')
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 12 or len(v) > 32:
            raise ValueError('Пароль должен содержать от 12 до 32 символов')
        if not any(c.isdigit() for c in v):
            raise ValueError('Пароль должен содержать хотя бы одну цифру')
        if not any(not c.isalnum() for c in v):
            raise ValueError('Пароль должен содержать хотя бы один специальный символ')
        if not any(c.islower() for c in v) or not any(c.isupper() for c in v):
            raise ValueError('Пароль должен содержать минимум две буквы в разных регистрах')
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


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
