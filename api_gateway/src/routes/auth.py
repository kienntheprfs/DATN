"""Authentication routes."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_current_user
from src.shared.auth.fastapiDI import require_roles
from src.schemas import (
    LoginRequest,
    GoogleLoginRequest,
    TokenResponse, 
    RefreshTokenRequest, 
    RevokeTokenRequest,
    RevokeTokenResponse,
    RevokeAllTokensRequest,
    RevokeAllTokensResponse,
    LogoutRequest,
    LogoutResponse,
    LogoutAllResponse,
    UserCreate, 
    UserRead
)
from src.services.auth_service import auth_service
from src.services.google_auth_service import google_auth_service
from src.services.token_service import token_service
from src.models import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract client information from request."""
    user_agent = request.headers.get("user-agent")
    # Try to get real IP, considering proxies
    ip_address = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip() 
        or request.headers.get("x-real-ip")
        or request.client.host if request.client else None
    )
    return user_agent, ip_address


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user."""
    user = await auth_service.register_user(user_data, db)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Login and get access/refresh tokens."""
    user_agent, ip_address = get_client_info(request)
    tokens = await auth_service.login(
        login_data.email, 
        login_data.password, 
        db,
        user_agent=user_agent,
        ip_address=ip_address
    )
    return tokens


@router.post("/google", response_model=TokenResponse)
async def google_login(
    google_data: GoogleLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login with Google OAuth2.

    Frontend sends the Google ID token (credential) received
    from Google Sign-In SDK. Backend verifies it and returns
    JWT access/refresh tokens.
    """
    user_agent, ip_address = get_client_info(request)
    tokens: TokenResponse = await google_auth_service.google_login(
        credential=google_data.credential,
        db=db,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    return tokens


@router.get("/me", response_model=UserRead)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get current authenticated user information.
    
    Requires valid JWT access token in Authorization header.
    Returns full user profile including Google OAuth fields.
    """
    return current_user


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token."""
    user_agent, ip_address = get_client_info(request)
    tokens = await auth_service.refresh_token(
        refresh_data.refresh_token, 
        db,
        user_agent=user_agent,
        ip_address=ip_address
    )
    return tokens


@router.post("/logout", response_model=LogoutResponse, dependencies=[Depends(require_roles(["user", "admin"]))])
async def logout(
    logout_data: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Logout from current device by revoking the refresh token.
    This invalidates the refresh token, preventing it from being used to get new access tokens.
    The user will need to login again on this device.
    
    User can only logout their own refresh tokens.
    """
    revoked_token = await token_service.revoke_own_refresh_token(
        logout_data.refresh_token,
        current_user.id,
        db
    )
    return LogoutResponse(
        message="Logged out successfully",
        revoked_at=revoked_token.revoked_at
    )


@router.post("/logout-all", response_model=LogoutAllResponse, dependencies=[Depends(require_roles(["user", "admin"]))])
async def logout_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Logout from all devices by revoking all refresh tokens for the current user.
    The user will need to login again on all devices.
    """
    count = await token_service.revoke_all_user_tokens(
        current_user.id,
        db
    )
    return LogoutAllResponse(
        message="Logged out from all devices successfully",
        tokens_revoked=count
    )


@router.post("/revoke", response_model=RevokeTokenResponse, dependencies=[Depends(require_roles(["admin"]))])
async def revoke_token(
    revoke_data: RevokeTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Revoke a specific refresh token (logout from current device).
    This invalidates the refresh token, preventing it from being used to get new access tokens.
    **Requires admin role.**
    """
    revoked_token = await token_service.revoke_arbitrary_refresh_token(
        revoke_data.refresh_token,
        db
    )
    return RevokeTokenResponse(
        message="Token revoked successfully",
        revoked_at=revoked_token.revoked_at
    )


@router.post("/revoke-all", response_model=RevokeAllTokensResponse, dependencies=[Depends(require_roles(["admin"]))])
async def revoke_all_tokens(
    revoke_data: RevokeAllTokensRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Revoke all refresh tokens for a user (logout from all devices).
    **Requires admin role.**
    
    Args:
        revoke_data: Request body with optional user_id. If not provided, revokes admin's own tokens.
    """
    target_user_id = revoke_data.user_id if revoke_data.user_id else current_user.id
    count = await token_service.revoke_all_user_tokens(
        target_user_id,
        db
    )
    return RevokeAllTokensResponse(
        message=f"All tokens revoked successfully for user {target_user_id}",
        tokens_revoked=count
    )

