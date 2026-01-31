"""Authentication schemas."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    """Token response schema."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Refresh token request schema."""
    refresh_token: str


class TokenPayload(BaseModel):
    """JWT token payload schema."""
    sub: str  # user_id
    email: str
    roles: list[str] = []
    exp: Optional[int] = None
    type: str = "access"  # "access" or "refresh"
