from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from fastapi import Depends, HTTPException, status, Request
import logging

from src.config import settings

logger = logging.getLogger(__name__)


# Database Engine with optimized connection pooling
engine = create_async_engine(
    settings.database_url_async,
    echo=settings.debug,
    pool_pre_ping=True,  # Test connections before using them
    pool_size=settings.db_pool_size,  # Number of persistent connections
    max_overflow=settings.db_max_overflow,  # Max temporary connections beyond pool_size
    pool_timeout=settings.db_pool_timeout,  # Wait timeout for connection
    pool_recycle=settings.db_pool_recycle,  # Recycle connections after N seconds
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for database sessions with proper error handling.
    
    Ensures that database sessions are properly cleaned up even if an error occurs.
    Automatically rolls back uncommitted transactions on error.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            # Rollback any pending transaction on error
            await session.rollback()
            logger.error(f"Database session error: {str(e)}")
            raise
        finally:
            # Always close the session
            await session.close()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Dependency to get the current authenticated user.
    Requires AuthMiddleware to set request.state.user.
    
    Returns:
        User: The authenticated user from database
        
    Raises:
        HTTPException: 401 if not authenticated
    """
    # Import here to avoid circular dependency
    from src.models import User
    
    # Check if user info exists in request state (set by AuthMiddleware)
    user_info = getattr(request.state, "user", None)
    
    if user_info is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Fetch full user object from database
    result = await db.execute(
        select(User).where(User.id == user_info.id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    
    return user


