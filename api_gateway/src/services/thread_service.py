"""Thread service for conversation management.

Implements Service Layer pattern following SOLID principles:
- Single Responsibility: Handles only thread-related business logic
- Open/Closed: Extensible for new thread operations
- Liskov Substitution: Could be abstracted to IThreadService interface
- Interface Segregation: Minimal, focused methods
- Dependency Inversion: Depends on SQLModel abstractions, not concrete DB
"""
import logging
from typing import List, Optional
from uuid import uuid4
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func, delete
from fastapi import HTTPException, status

from src.models import Thread

logger = logging.getLogger(__name__)


class ThreadService:
    """Service for managing conversation threads.
    
    Provides database operations for thread CRUD following Repository pattern.
    All methods are async and use SQLModel for type safety.
    """
    
    @staticmethod
    async def create_thread(
        db: AsyncSession,
        user_id: str,
        agent_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> Thread:
        """Create a new thread for a user.
        
        Args:
            db: Database session
            user_id: Owner user ID
            agent_id: Optional agent identifier
            title: Optional thread title
            
        Returns:
            Created Thread instance
            
        Raises:
            HTTPException: If database error occurs
            
        Example:
            thread = await ThreadService.create_thread(
                db, user_id="user-123", agent_id="research-agent"
            )
        """
        try:
            thread = Thread(
                id=str(uuid4()),
                user_id=user_id,
                agent_id=agent_id,
                title=title or "Untitled Conversation",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            
            db.add(thread)
            await db.commit()
            await db.refresh(thread)
            
            return thread
        except Exception as e:
            await db.rollback()
            logger.error("Failed to create thread for user %s: %s", user_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create thread. Please try again later."
            )
    
    @staticmethod
    async def get_thread(
        db: AsyncSession,
        thread_id: str,
        for_update: bool = False,
    ) -> Optional[Thread]:
        """
        Get thread by ID.
        
        Args:
            db: Database session
            thread_id: Thread ID
            for_update: If True, locks the row with SELECT FOR UPDATE
            
        Returns:
            Thread instance or None if not found
        """
        stmt = select(Thread).where(Thread.id == thread_id)
        
        if for_update:
            # Use SELECT FOR UPDATE to lock the row and prevent race conditions
            stmt = stmt.with_for_update()
        
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_thread_owner(
        db: AsyncSession,
        thread_id: str,
    ) -> Optional[str]:
        """Get thread owner user ID.
        
        Args:
            db: Database session
            thread_id: Thread ID
            
        Returns:
            User ID or None if thread not found
            
        Note:
            Lightweight query that only fetches user_id column
        """
        stmt = select(Thread.user_id).where(Thread.id == thread_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def list_user_threads(
        db: AsyncSession,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "desc",
    ) -> List[Thread]:
        """List threads owned by a user.
        
        Args:
            db: Database session
            user_id: User ID
            limit: Maximum number of threads to return (default 50, max 100)
            offset: Number of threads to skip (for pagination)
            order_by: Sort order - "asc" or "desc" by created_at
            
        Returns:
            List of Thread instances
            
        Raises:
            HTTPException: If database error occurs
            
        Example:
            # Get first page
            threads = await ThreadService.list_user_threads(db, "user-123", limit=20)
            
            # Get second page
            threads = await ThreadService.list_user_threads(db, "user-123", limit=20, offset=20)
        """
        try:
            # Clamp limit to reasonable range
            limit = min(max(1, limit), 100)
            
            stmt = select(Thread).where(Thread.user_id == user_id).offset(offset).limit(limit)
            
            # Order by created_at
            if order_by.lower() == "desc":
                stmt = stmt.order_by(Thread.created_at.desc())
            else:
                stmt = stmt.order_by(Thread.created_at.asc())
            
            result = await db.execute(stmt)
            return list(result.scalars().all())
        except Exception as e:
            logger.error("Failed to list threads for user %s: %s", user_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to list threads. Please try again later."
            )
    
    @staticmethod
    async def count_user_threads(
        db: AsyncSession,
        user_id: str,
    ) -> int:
        """Count total threads owned by a user.
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Total count of user's threads
            
        Raises:
            HTTPException: If database error occurs
            
        Example:
            total = await ThreadService.count_user_threads(db, "user-123")
        """
        try:
            stmt = select(func.count(Thread.id)).where(Thread.user_id == user_id)
            result = await db.execute(stmt)
            return result.scalar_one()
        except Exception as e:
            logger.error("Failed to count threads for user %s: %s", user_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to count threads. Please try again later."
            )
    
    @staticmethod
    async def update_thread(
        db: AsyncSession,
        thread_id: str,
        title: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> Optional[Thread]:
        """
        Update thread properties with proper locking to prevent race conditions.
        Uses SELECT FOR UPDATE to ensure atomic updates.
        
        Args:
            db: Database session
            thread_id: Thread ID
            title: New title (if provided)
            agent_id: New agent ID (if provided)
            
        Returns:
            Updated Thread instance or None if not found
            
        Raises:
            HTTPException: If database error occurs
        """
        try:
            # Lock the row with SELECT FOR UPDATE to prevent concurrent modifications
            thread = await ThreadService.get_thread(db, thread_id, for_update=True)
            if thread is None:
                return None
            
            if title is not None:
                thread.title = title
            if agent_id is not None:
                thread.agent_id = agent_id
            
            thread.updated_at = datetime.utcnow()
            
            db.add(thread)
            await db.commit()
            await db.refresh(thread)
            
            return thread
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Failed to update thread %s: %s", thread_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update thread. Please try again later."
            )
    
    @staticmethod
    async def delete_thread(
        db: AsyncSession,
        thread_id: str,
    ) -> bool:
        """Delete thread by ID.
        
        Args:
            db: Database session
            thread_id: Thread ID
            
        Returns:
            True if deleted, False if not found
            
        Raises:
            HTTPException: If database error occurs
        """
        try:
            stmt = delete(Thread).where(Thread.id == thread_id)
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error("Failed to delete thread %s: %s", thread_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete thread. Please try again later."
            )
    
    @staticmethod
    async def delete_user_threads(
        db: AsyncSession,
        user_id: str,
    ) -> int:
        """Delete all threads owned by a user.
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Number of threads deleted
            
        Raises:
            HTTPException: If database error occurs
            
        Note:
            Use with caution - this is a bulk delete operation
        """
        try:
            stmt = delete(Thread).where(Thread.user_id == user_id)
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount
        except Exception as e:
            await db.rollback()
            logger.error("Failed to delete threads for user %s: %s", user_id, e, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete user threads. Please try again later."
            )
