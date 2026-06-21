from pydantic import BaseModel, Field, field_validator, model_validator


class PasswordChangeRequestResponse(BaseModel):
    message: str
    retry_after_seconds: int = 0


class PasswordChangeCodeResponse(BaseModel):
    message: str
    username: str | None = None


class PasswordChangeConfirmRequest(BaseModel):
    code: str
    new_password: str = Field(max_length=64)
    repeat_password: str = Field(max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < 12 or len(value) > 32:
            raise ValueError("Пароль должен содержать от 12 до 32 символов")
        if not any(c.isdigit() for c in value):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        if not any(not c.isalnum() for c in value):
            raise ValueError("Пароль должен содержать хотя бы один специальный символ")
        if not any(c.islower() for c in value) or not any(c.isupper() for c in value):
            raise ValueError("Пароль должен содержать минимум две буквы в разных регистрах")
        return value

    @model_validator(mode="after")
    def validate_repeated_password(self):
        if self.new_password != self.repeat_password:
            raise ValueError("Пароли не совпадают")
        return self
