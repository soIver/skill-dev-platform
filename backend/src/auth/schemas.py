from pydantic import BaseModel


class Credentials(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str

class AuthResponse(BaseModel):
    token_type: str = "bearer"
    user: UserResponse

class MessageResponse(BaseModel):
    message: str
