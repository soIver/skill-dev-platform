import re

from pydantic import BaseModel, field_validator

# буквы не из латиницы и кириллицы (unicode-буква, но не [a-zA-Zа-яА-ЯёЁ])
_OTHER_ALPHA = re.compile(r'[^\W\d_а-яА-ЯёЁa-zA-Z]')

# простая проверка формата email
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')


class LoginCredentials(BaseModel):
    identifier: str
    password: str


class RegistrationCredentials(BaseModel):
    username: str
    email: str
    password: str
    github_token: str | None = None

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 4 or len(v) > 32:
            raise ValueError('Имя пользователя должно содержать от 4 до 32 символов')
        if ' ' in v:
            raise ValueError('Имя пользователя не должно содержать пробелы')
        if _OTHER_ALPHA.search(v):
            raise ValueError('Буквенные символы в имени пользователя могут быть только на латинице и кириллице')
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
        if not re.search(r'[^a-zA-Zа-яА-ЯёЁ0-9]', v):
            raise ValueError('Пароль должен содержать хотя бы один специальный символ')
        if _OTHER_ALPHA.search(v):
            raise ValueError('Буквенные символы в пароле могут быть только на латинице и кириллице')
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


class AuthResponse(BaseModel):
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
