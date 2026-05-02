from pydantic import BaseModel


class LoginCredentials(BaseModel):
    identifier: str
    password: str


class RegistrationCredentials(BaseModel):
    username: str
    email: str
    password: str


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
