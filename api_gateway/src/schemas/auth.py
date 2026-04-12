"""Authentication schemas."""
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str = Field(..., min_length=8)


class GoogleLoginRequest(BaseModel):
    """Google OAuth2 login request.
    
    Frontend may send either:
    - credential: Google ID token from Google Identity Services (GIS) ID flow.
    - access_token: OAuth2 access token from GIS token flow.
    """
    credential: Optional[str] = Field(
        None,
        min_length=1,
        description="Google ID token from frontend Google Sign-In SDK",
    )
    access_token: Optional[str] = Field(
        None,
        min_length=1,
        description="Google OAuth access token from frontend GIS token flow",
    )

    @model_validator(mode="after")
    def validate_google_token(self) -> "GoogleLoginRequest":
        if not self.credential and not self.access_token:
            raise ValueError("Either credential or access_token must be provided")
        return self


class GoogleUserInfo(BaseModel):
    """Parsed Google user info from verified ID token."""
    google_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    email_verified: bool = False


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


class RevokeAllTokensRequest(BaseModel):
    """Request for revoking all tokens of a user."""
    user_id: Optional[str] = Field(None, description="User ID to revoke tokens for. If not provided, revokes admin's own tokens.")


class LogoutRequest(BaseModel):
    """Logout request schema (logout from current device)."""
    refresh_token: str


class LogoutResponse(BaseModel):
    """Response for user logout."""
    message: str
    revoked_at: datetime


class LogoutAllResponse(BaseModel):
    """Response for logging out from all devices."""
    message: str
    tokens_revoked: int


class TokenPayload(BaseModel):
    """JWT token payload schema."""
    sub: str  # user_id
    email: str
    roles: list[str] = []
    exp: Optional[int] = None
    type: str = "access"  # "access" or "refresh"
