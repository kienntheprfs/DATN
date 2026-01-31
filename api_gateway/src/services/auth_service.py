"""Authentication service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from src.models import User, Role
from src.shared.auth.password import password_handler
from src.shared.auth.jwt_handler import jwt_handler
from src.schemas import UserCreate, TokenResponse


class AuthService:
    """Authentication business logic."""
    
    @staticmethod
    async def register_user(
        user_data: UserCreate,
        db: AsyncSession
    ) -> User:
        """Register a new user."""
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
    
    @staticmethod
    async def login(
        email: str,
        password: str,
        db: AsyncSession
    ) -> TokenResponse:
        """Authenticate user and return tokens."""
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
        
        # Create tokens
        access_token = jwt_handler.create_access_token(
            user_id=user.id,
            email=user.email,
            roles=role_names
        )
        
        refresh_token = jwt_handler.create_refresh_token(
            user_id=user.id,
            email=user.email
        )
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )
    
    @staticmethod
    async def refresh_token(
        refresh_token: str,
        db: AsyncSession
    ) -> TokenResponse:
        """Refresh access token using refresh token."""
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
        
        # Create new tokens
        new_access_token = jwt_handler.create_access_token(
            user_id=user.id,
            email=user.email,
            roles=role_names
        )
        
        new_refresh_token = jwt_handler.create_refresh_token(
            user_id=user.id,
            email=user.email
        )
        
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer"
        )


# Global instance
auth_service = AuthService()
