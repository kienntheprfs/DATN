"""Thread management routes.

Provides CRUD operations for conversation threads following REST principles.
Uses fastapiDI for authorization following SOLID's Open/Closed principle.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy.ext.asyncio import AsyncSession


from src.dependencies import get_db
from src.services.thread_service import ThreadService
from src.shared.auth.fastapiDI import require_auth, require_ownership
from src.models import Thread
from src.schemas.thread import (
    ThreadCreateRequest,
    ThreadUpdateRequest,
    ThreadResponse,
    ThreadListResponse,
)


router = APIRouter(prefix="/threads", tags=["Threads"])





# Routes
@router.post(
    "",
    response_model=ThreadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new thread",
    description="Create a new conversation thread for the authenticated user",
    dependencies=[Depends(require_auth)],
)
async def create_thread(
    thread_data: ThreadCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new thread for the authenticated user."""
    user = request.state.user
    
    thread = await ThreadService.create_thread(
        db=db,
        user_id=user.id,
        agent_id=thread_data.agent_id,
        title=thread_data.title,
    )
    
    return ThreadResponse.model_validate(thread)


@router.get(
    "",
    response_model=ThreadListResponse,
    summary="List user's threads",
    description="Get paginated list of threads owned by the authenticated user",
    dependencies=[Depends(require_auth)],
)
async def list_threads(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100, description="Maximum threads to return"),
    offset: int = Query(0, ge=0, description="Number of threads to skip"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order by created_at"),
):
    """List threads owned by the authenticated user."""
    user = request.state.user
    
    # Get threads and total count in parallel
    threads = await ThreadService.list_user_threads(
        db=db,
        user_id=user.id,
        limit=limit,
        offset=offset,
        order_by=order,
    )
    
    total = await ThreadService.count_user_threads(db=db, user_id=user.id)
    
    return ThreadListResponse(
        threads=[ThreadResponse.model_validate(t) for t in threads],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{thread_id}",
    response_model=ThreadResponse,
    summary="Get thread details",
    description="Retrieve details of a specific thread (ownership required)",
    dependencies=[Depends(require_ownership("thread_id", Thread))],
)
async def get_thread(
    thread_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get thread by ID (requires ownership or admin role)."""
    thread = await ThreadService.get_thread(db=db, thread_id=thread_id)
    
    # This should not happen since @require_ownership checks existence
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )
    
    return ThreadResponse.model_validate(thread)


@router.patch(
    "/{thread_id}",
    response_model=ThreadResponse,
    summary="Update thread",
    description="Update thread title or agent (ownership required)",
    dependencies=[Depends(require_ownership("thread_id", Thread))],
)
async def update_thread(
    thread_id: str,
    thread_data: ThreadUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update thread properties (requires ownership or admin role)."""
    thread = await ThreadService.update_thread(
        db=db,
        thread_id=thread_id,
        title=thread_data.title,
        agent_id=thread_data.agent_id,
    )
    
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )
    
    return ThreadResponse.model_validate(thread)


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete thread",
    description="Delete a thread (ownership required)",
    dependencies=[Depends(require_ownership("thread_id", Thread))],
)
async def delete_thread(
    thread_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete thread by ID (requires ownership or admin role)."""
    deleted = await ThreadService.delete_thread(db=db, thread_id=thread_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )
    
    return None
