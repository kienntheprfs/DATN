"""Authentication schemas."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


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


class RevokeTokenRequest(BaseModel):
    """Revoke token request schema."""
    refresh_token: str


class RevokeTokenResponse(BaseModel):
    """Response for token revocation."""
    message: str
    revoked_at: datetime


class RevokeAllTokensResponse(BaseModel):
    """Response for revoking all tokens."""
    message: str
    tokens_revoked: int


class TokenPayload(BaseModel):
    """JWT token payload schema."""
    sub: str  # user_id
    email: str
    roles: list[str] = []
    exp: Optional[int] = None
    type: str = "access"  # "access" or "refresh"
