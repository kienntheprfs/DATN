"""Google OAuth2 authentication service.

Handles Google ID token verification and user provisioning.
Follows the Strategy pattern — can be extended with other OAuth providers
by creating sibling services (e.g., GitHubAuthService) that share
the same token-issuing interface.

Flow:
    1. Frontend obtains Google ID token via Google Sign-In SDK popup.
    2. Frontend sends token to POST /auth/google.
    3. This service verifies the token with Google's public keys.
    4. Finds or creates a local user record (account linking by email).
    5. Issues JWT access + refresh tokens identical to email/password login.
"""
import logging
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.config import settings
from src.models import AuthProvider, Role, User
from src.schemas.auth import GoogleUserInfo, TokenResponse
from src.services.token_service import token_service
from src.shared.auth.jwt_handler import jwt_handler

logger = logging.getLogger(__name__)


class GoogleAuthService:
    """Google OAuth2 authentication business logic.

    Responsible for:
    - Verifying Google ID tokens (delegated to ``google-auth`` library).
    - Finding or creating local user records (account linking by email).
    - Issuing JWT tokens via the existing :class:`JWTHandler`.

    This class is stateless; a global singleton ``google_auth_service`` is
    exported at module level.
    """

    # ------------------------------------------------------------------ #
    # Token verification
    # ------------------------------------------------------------------ #

    @staticmethod
    async def verify_google_token(credential: str) -> GoogleUserInfo:
        """Verify a Google ID token and extract user information.

        Uses ``google.oauth2.id_token.verify_oauth2_token`` which:
        - Validates the token signature against Google's public keys.
        - Checks ``iss`` is ``accounts.google.com`` or ``https://accounts.google.com``.
        - Checks ``aud`` matches our configured ``GOOGLE_CLIENT_ID``.
        - Checks ``exp`` has not passed.

        Args:
            credential: The raw JWT ID token string from Google Sign-In SDK.

        Returns:
            GoogleUserInfo populated from the verified token claims.

        Raises:
            HTTPException(401): If the token fails any validation check.
        """
        if not settings.google_client_id:
            logger.error("Google OAuth is not configured: GOOGLE_CLIENT_ID is empty")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google login is not configured on this server",
            )

        try:
            idinfo: dict = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                settings.google_client_id,
                clock_skew_in_seconds=60,  # Allow 60 seconds clock skew tolerance
            )

            # Additional issuer check (belt-and-suspenders; library already checks)
            if idinfo.get("iss") not in (
                "accounts.google.com",
                "https://accounts.google.com",
            ):
                raise ValueError("Token issuer is not Google")

            return GoogleUserInfo(
                google_id=idinfo["sub"],
                email=idinfo["email"],
                name=idinfo.get("name"),
                picture=idinfo.get("picture"),
                email_verified=idinfo.get("email_verified", False),
            )

        except ValueError as exc:
            logger.warning("Google token verification failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google token: {exc}",
            ) from exc

    # ------------------------------------------------------------------ #
    # Full login flow
    # ------------------------------------------------------------------ #

    @staticmethod
    async def google_login(
        credential: str,
        db: AsyncSession,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> TokenResponse:
        """Complete Google login flow.

        Steps:
            1. Verify the Google ID token.
            2. Find an existing user by ``google_id`` **or** ``email``
               (account linking).
            3. Create a new user if none exists.
            4. Ensure the user is active.
            5. Issue JWT access + refresh tokens.

        Account-linking scenarios:
            - **New user**: Creates a user with ``auth_provider='google'``.
            - **Existing Google user**: Updates profile fields if changed.
            - **Existing local user (same email)**: Links the Google account
              by setting ``google_id`` and updating profile fields.

        Args:
            credential: Google ID token string.
            db: Async database session.
            user_agent: Optional client User-Agent header.
            ip_address: Optional client IP address.

        Returns:
            TokenResponse with ``access_token`` and ``refresh_token``.

        Raises:
            HTTPException(400): If Google email is not verified.
            HTTPException(401): If the Google token is invalid.
            HTTPException(403): If the user account is inactive.
            HTTPException(503): If Google OAuth is not configured.
        """
        # Step 1: Verify token -------------------------------------------
        google_user: GoogleUserInfo = await GoogleAuthService.verify_google_token(
            credential,
        )

        if not google_user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google email is not verified. Please verify your email with Google first.",
            )

        # Step 2: Find or create user ------------------------------------
        try:
            user: Optional[User] = await GoogleAuthService._find_or_create_user(
                google_user, db,
            )
        except IntegrityError:
            # Race condition: another request created the user simultaneously.
            # Database unique constraint caught it — retry the lookup.
            await db.rollback()
            logger.info(
                "Concurrent Google user creation for %s — retrying lookup",
                google_user.email,
            )
            user = await GoogleAuthService._find_or_create_user(
                google_user, db,
            )

        # Step 3: Active check -------------------------------------------
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive",
            )

        # Step 4: Issue tokens -------------------------------------------
        role_names: list[str] = user.get_role_names()

        access_token: str = jwt_handler.create_access_token(
            user_id=user.id,
            email=user.email,
            roles=role_names,
        )

        refresh_token: str
        from datetime import datetime
        expires_at: datetime
        refresh_token, expires_at = jwt_handler.create_refresh_token_with_expiry(
            user_id=user.id,
            email=user.email,
        )

        await token_service.store_refresh_token(
            token=refresh_token,
            user_id=user.id,
            expires_at=expires_at,
            db=db,
            user_agent=user_agent,
            ip_address=ip_address,
            auto_commit=True,
        )

        logger.info(
            "Google login successful: user_id=%s, email=%s, provider=%s",
            user.id,
            user.email,
            user.auth_provider,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    # ------------------------------------------------------------------ #
    # Private helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    async def _find_or_create_user(
        google_user: GoogleUserInfo,
        db: AsyncSession,
    ) -> User:
        """Find an existing user or create a new one.

        Lookup priority:
            1. ``google_id`` match → same Google account, returning user.
            2. ``email`` match → account linking (existing local user).
            3. No match → create brand new user.

        Note:
            The surrounding caller handles ``IntegrityError`` for race-condition
            safety on the ``email`` / ``google_id`` unique constraints.
        """
        result = await db.execute(
            select(User).where(
                or_(
                    User.google_id == google_user.google_id,
                    User.email == google_user.email,
                )
            )
        )
        user: Optional[User] = result.scalar_one_or_none()

        if user is not None:
            return await GoogleAuthService._update_existing_user(
                user, google_user, db,
            )

        return await GoogleAuthService._create_new_user(google_user, db)

    @staticmethod
    async def _update_existing_user(
        user: User,
        google_user: GoogleUserInfo,
        db: AsyncSession,
    ) -> User:
        """Update an existing user with latest Google profile data.

        If the user was originally a local (email/password) user, this links
        their Google account by setting ``google_id`` and changing
        ``auth_provider``.
        """
        changed: bool = False

        # Link Google account if not yet linked
        if user.google_id is None:
            user.google_id = google_user.google_id
            user.auth_provider = AuthProvider.GOOGLE
            changed = True
            logger.info(
                "Linked Google account to existing user: email=%s, google_id=%s",
                user.email,
                google_user.google_id,
            )

        # Refresh profile fields
        if google_user.picture and user.avatar_url != google_user.picture:
            user.avatar_url = google_user.picture
            changed = True

        if google_user.name and user.display_name != google_user.name:
            user.display_name = google_user.name
            changed = True

        if changed:
            from datetime import datetime

            user.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(user)

        return user

    @staticmethod
    async def _create_new_user(
        google_user: GoogleUserInfo,
        db: AsyncSession,
    ) -> User:
        """Create a new user from Google profile data.

        Assigns the default ``user`` role automatically.
        """
        user: User = User(
            email=google_user.email,
            hashed_password=None,  # Google users have no password
            auth_provider=AuthProvider.GOOGLE,
            google_id=google_user.google_id,
            display_name=google_user.name,
            avatar_url=google_user.picture,
        )

        # Assign default "user" role
        result = await db.execute(select(Role).where(Role.name == "user"))
        role: Optional[Role] = result.scalar_one_or_none()
        if role:
            user.roles.append(role)

        db.add(user)
        await db.commit()
        await db.refresh(user)

        logger.info(
            "Created new Google user: user_id=%s, email=%s",
            user.id,
            user.email,
        )
        return user


# Global singleton
google_auth_service: GoogleAuthService = GoogleAuthService()
