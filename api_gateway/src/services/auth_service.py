"""Authentication service."""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from src.models import AuthProvider, User, Role
from src.shared.auth.password import password_handler
from src.shared.auth.jwt_handler import jwt_handler
from src.schemas import UserCreate, TokenResponse
from src.services.token_service import token_service

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication business logic."""
    
    @staticmethod
    async def register_user(
        user_data: UserCreate,
        db: AsyncSession
    ) -> User:
        """
        Register a new user.
        
        Handles race conditions by catching IntegrityError (duplicate email).
        Database unique constraint on email provides final protection against duplicates.
        
        Args:
            user_data: User registration data
            db: Database session
            
        Returns:
            User: Created user instance
            
        Raises:
            HTTPException: If email already registered or database error
        """
        try:
            # Check if user already exists
            result = await db.execute(
                select(User).where(User.email == user_data.email)
            )
            existing_user = result.scalar_one_or_none()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            
            # Hash password
            hashed_password = password_handler.hash_password(user_data.password)
            
            # Create user
            user = User(
                email=user_data.email,
                hashed_password=hashed_password,
            )
            
            # Assign roles
            for role_name in user_data.roles:
                result = await db.execute(
                    select(Role).where(Role.name == role_name)
                )
                role = result.scalar_one_or_none()
                if role:
                    user.roles.append(role)
            
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
            return user
        except IntegrityError as e:
            await db.rollback()
            # This can happen if two requests try to register the same email simultaneously
            # Database unique constraint caught it
            logger.warning("Duplicate email registration attempt (IntegrityError): %s", user_data.email)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Unexpected error during registration for %s: %s", user_data.email, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register user. Please try again later."
            )
    
    @staticmethod
    async def login(
        email: str,
        password: str,
        db: AsyncSession,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> TokenResponse:
        """
        Authenticate user and return tokens.
        
        Raises:
            HTTPException: If authentication fails or database error occurs
        """
        try:
            # Get user
            result = await db.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect email or password"
                )
            
            # Prevent Google-only users from logging in with email/password
            if user.auth_provider == AuthProvider.GOOGLE and not user.hashed_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This account uses Google Sign-In. Please login with Google.",
                )
            
            # Verify password
            if not password_handler.verify_password(password, user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect email or password"
                )
            
            # Check if user is active
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is inactive"
                )
            
            # Get user roles
            role_names = [role.name for role in user.roles]
            
            # Create access token
            access_token = jwt_handler.create_access_token(
                user_id=user.id,
                email=user.email,
                roles=role_names
            )
            
            # Create refresh token with expiry
            refresh_token, expires_at = jwt_handler.create_refresh_token_with_expiry(
                user_id=user.id,
                email=user.email
            )
            
            # Store refresh token in database (auto_commit=True for standalone operation)
            await token_service.store_refresh_token(
                token=refresh_token,
                user_id=user.id,
                expires_at=expires_at,
                db=db,
                user_agent=user_agent,
                ip_address=ip_address,
                auto_commit=True,
            )
            
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer"
            )
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Unexpected error during login for %s: %s", email, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Login failed. Please try again later."
            )
    
    @staticmethod
    async def refresh_token(
        refresh_token: str,
        db: AsyncSession,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> TokenResponse:
        """
        Refresh access token using refresh token.
        Uses SELECT FOR UPDATE to prevent race conditions when multiple requests
        try to use the same refresh token simultaneously.
        
        Raises:
            HTTPException: If token is invalid or database error occurs
        """
        try:
            # Validate token in database with row-level locking to prevent race conditions
            # This ensures only ONE request can use this token at a time
            token_record = await token_service.validate_refresh_token(
                refresh_token, db, lock_for_update=True
            )
            
            # Decode JWT token
            try:
                token_payload = jwt_handler.decode_token(refresh_token)
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=str(e)
                )
            
            # Verify it's a refresh token
            if not jwt_handler.verify_token_type(token_payload, "refresh"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token type"
                )
            
            # Get user
            result = await db.execute(
                select(User).where(User.id == token_payload.sub)
            )
            user = result.scalar_one_or_none()
            
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found or inactive"
                )
            
            # Get user roles
            role_names = [role.name for role in user.roles]
            
            # Create new access token
            new_access_token = jwt_handler.create_access_token(
                user_id=user.id,
                email=user.email,
                roles=role_names
            )
            
            # Create new refresh token with expiry
            new_refresh_token, expires_at = jwt_handler.create_refresh_token_with_expiry(
                user_id=user.id,
                email=user.email
            )
            
            # Revoke old refresh token (rotation strategy)
            # Since we already have the lock from validate_refresh_token, we can safely revoke
            token_record.revoke()
            
            # Store new refresh token WITHOUT committing (auto_commit=False)
            # This ensures atomicity: both revoke and store happen in same transaction
            await token_service.store_refresh_token(
                token=new_refresh_token,
                user_id=user.id,
                expires_at=expires_at,
                db=db,
                user_agent=user_agent,
                ip_address=ip_address,
                auto_commit=False,  # CRITICAL: Don't commit yet!
            )
            
            # Commit all changes atomically (revoke old + store new)
            await db.commit()
            
            return TokenResponse(
                access_token=new_access_token,
                refresh_token=new_refresh_token,
                token_type="bearer"
            )
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Unexpected error during token refresh: %s", e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to refresh token. Please try again later."
            )


# Global instance
auth_service = AuthService()
