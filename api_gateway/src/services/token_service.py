"""Token service for refresh token management."""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from src.models import RefreshToken
from src.config import settings


class TokenService:
    """Service for managing refresh tokens following Single Responsibility Principle."""
    
    @staticmethod
    async def store_refresh_token(
        token: str,
        user_id: str,
        expires_at: datetime,
        db: AsyncSession,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        auto_commit: bool = True,
    ) -> RefreshToken:
        """
        Store a new refresh token in the database.
        
        IMPORTANT: When called within a larger transaction (e.g., refresh_token flow),
        set auto_commit=False to maintain atomicity. The caller is responsible for
        committing the transaction.
        
        Args:
            token: The JWT refresh token string
            user_id: ID of the user who owns this token
            expires_at: Token expiration timestamp
            db: Database session
            user_agent: Optional user agent string
            ip_address: Optional IP address
            auto_commit: If True, commits immediately. If False, caller must commit.
            
        Returns:
            RefreshToken: Created refresh token record
            
        Raises:
            HTTPException: If token already exists (duplicate)
        """
        refresh_token = RefreshToken(
            token=token,
            user_id=user_id,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        
        try:
            db.add(refresh_token)
            
            if auto_commit:
                await db.commit()
                await db.refresh(refresh_token)
            else:
                # Flush to get the ID but don't commit
                await db.flush()
                await db.refresh(refresh_token)
            
            return refresh_token
        except IntegrityError as e:
            await db.rollback()
            # Token already exists (unique constraint violation)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Duplicate token generated. Please try again."
            )
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to store refresh token: {str(e)}"
            )
    
    @staticmethod
    async def get_refresh_token(
        token: str,
        db: AsyncSession,
        for_update: bool = False
    ) -> Optional[RefreshToken]:
        """
        Retrieve a refresh token from the database.
        
        Args:
            token: The JWT refresh token string
            db: Database session
            for_update: If True, locks the row with SELECT FOR UPDATE
            
        Returns:
            RefreshToken or None: The token record if found
            
        Raises:
            Exception: If database error occurs
        """
        try:
            query = select(RefreshToken).where(RefreshToken.token == token)
            
            if for_update:
                # Use SELECT FOR UPDATE to lock the row and prevent race conditions
                query = query.with_for_update()
            
            result = await db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            # Let caller handle the error
            raise
    
    @staticmethod
    async def validate_refresh_token(
        token: str,
        db: AsyncSession,
        lock_for_update: bool = False
    ) -> RefreshToken:
        """
        Validate a refresh token (check if it exists, not revoked, not expired).
        Uses SELECT FOR UPDATE when lock_for_update=True to prevent race conditions.
        
        Args:
            token: The JWT refresh token string
            db: Database session
            lock_for_update: If True, locks the row to prevent concurrent modifications
            
        Returns:
            RefreshToken: Valid token record
            
        Raises:
            HTTPException: If token is invalid, revoked, or expired
        """
        refresh_token = await TokenService.get_refresh_token(token, db, for_update=lock_for_update)
        
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        if refresh_token.is_revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked"
            )
        
        if refresh_token.expires_at <= datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has expired"
            )
        
        return refresh_token
    
    @staticmethod
    async def revoke_refresh_token(
        token: str,
        db: AsyncSession
    ) -> RefreshToken:
        """
        Revoke a specific refresh token with proper locking to prevent race conditions.
        Uses SELECT FOR UPDATE to ensure atomic revocation.
        
        Args:
            token: The JWT refresh token string
            db: Database session
            
        Returns:
            RefreshToken: Revoked token record
            
        Raises:
            HTTPException: If token not found or database error
        """
        try:
            # Lock the row with SELECT FOR UPDATE to prevent concurrent modifications
            refresh_token = await TokenService.get_refresh_token(token, db, for_update=True)
            
            if not refresh_token:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Refresh token not found"
                )
            
            if refresh_token.is_revoked:
                # Already revoked, return it as is (idempotent operation)
                # No need to commit since nothing changed
                return refresh_token
            
            # Revoke the token (this is now safe because we have the row lock)
            refresh_token.revoke()
            await db.commit()
            await db.refresh(refresh_token)
            
            return refresh_token
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to revoke token: {str(e)}"
            )
    
    @staticmethod
    async def revoke_all_user_tokens(
        user_id: str,
        db: AsyncSession
    ) -> int:
        """
        Revoke all refresh tokens for a specific user.
        Useful for logout from all devices.
        Uses SELECT FOR UPDATE to prevent race conditions.
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            int: Number of tokens revoked
            
        Raises:
            HTTPException: If database error occurs
        """
        try:
            # Use SELECT FOR UPDATE to lock all matching rows atomically
            result = await db.execute(
                select(RefreshToken)
                .where(
                    and_(
                        RefreshToken.user_id == user_id,
                        RefreshToken.is_revoked == False
                    )
                )
                .with_for_update()
            )
            tokens = result.scalars().all()
            
            count = 0
            for token in tokens:
                token.revoke()
                count += 1
            
            await db.commit()
            return count
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to revoke user tokens: {str(e)}"
            )
    
    @staticmethod
    async def cleanup_expired_tokens(
        db: AsyncSession
    ) -> int:
        """
        Clean up expired tokens from the database.
        This should be run periodically (e.g., via a background job).
        
        Args:
            db: Database session
            
        Returns:
            int: Number of tokens deleted
            
        Raises:
            HTTPException: If database error occurs
        """
        try:
            result = await db.execute(
                select(RefreshToken).where(
                    RefreshToken.expires_at <= datetime.utcnow()
                )
            )
            expired_tokens = result.scalars().all()
            
            count = 0
            for token in expired_tokens:
                await db.delete(token)
                count += 1
            
            await db.commit()
            return count
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to cleanup expired tokens: {str(e)}"
            )


# Global instance
token_service = TokenService()
