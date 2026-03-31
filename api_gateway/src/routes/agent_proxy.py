"""Agent service proxy routes with selective authorization.

Implements proxy pattern following SOLID principles:
- Single Responsibility: Only handles proxying to agent service
- Open/Closed: Extensible for new agent routes
- Liskov Substitution: Could implement IProxyRouter interface
- Dependency Inversion: Depends on httpx abstraction
"""
import logging
from typing import Optional
from fastapi import APIRouter, Request, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from src.config import settings
from src.dependencies import get_http_client, get_db
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.fastapiDI import require_ownership
from src.services.thread_service import ThreadService
from src.models import Thread

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/agent", tags=["Agent Service"])


@router.post(
    "/invoke",
    summary="Invoke agent",
    description="Invoke agent for chat completion (public, guest-friendly)",
)
async def invoke_agent(
    request: Request,
    db: AsyncSession = Depends(get_db),
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Invoke agent - public endpoint, supports both authenticated users and guests.
    
    Behavior:
    - Authenticated users: Optionally track thread in database
    - Guest users: No thread tracking (client-side thread_id in sessionStorage)
    
    Request body should contain:
    - thread_id (optional): Client-provided thread ID
    - agent_id (optional): Agent identifier
    - messages: List of chat messages
    """
    try:
        user = getattr(request.state, "user", None)
        
        # Optional: Auto-create thread for authenticated users
        # This is optional - client can also manage threads via /threads endpoints
        if user is not None:
            # Try to extract thread_id from request body for tracking
            # This is a best-effort approach
            try:
                body = await request.json()
                thread_id = body.get("thread_id")
                agent_id = body.get("agent_id")
                
                # If thread_id not provided, create new thread
                if not thread_id and agent_id:
                    thread = await ThreadService.create_thread(
                        db=db,
                        user_id=user.id,
                        agent_id=agent_id,
                        title="New Conversation",
                    )
                    # Note: We can't modify request body easily in FastAPI
                    # Client should create thread first via POST /threads
                    # This is just a placeholder for potential auto-tracking
            except Exception as e:
                # If body parsing fails, log and continue without tracking
                logger.warning(f"Failed to parse request body for thread tracking: {str(e)}")
                pass
        
        # Proxy to agent service
        target_url = settings.agent_service_url

        return await proxy_request(request, target_url, client, user=user)
        
    except HTTPException:
        # Re-raise HTTPException from service layer
        raise
    except Exception as e:
        logger.error(f"Error invoking agent: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to invoke agent. Please try again later."
        )


@router.get(
    "/history/{thread_id}",
    summary="Get thread history",
    description="Retrieve chat history for a thread (requires ownership)",
    dependencies=[Depends(require_ownership("thread_id", Thread))],
)
async def get_thread_history(
    thread_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Get thread history - requires authentication and ownership.
    
    Authorization:
    - User must own the thread (checked by @require_ownership fastapiDI)
    - Admins can access all thread histories
    """
    try:
        user = request.state.user
        
        # Build target URL
        target_url = f"{settings.agent_service_url}/history/{thread_id}"

        return await proxy_request(request, target_url, client, user=user)
        
    except HTTPException:
        # Re-raise HTTPException from fastapiDI (ownership check)
        raise
    except Exception as e:
        logger.error(f"Error retrieving thread history for {thread_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve thread history. Please try again later."
        )


# Generic proxy for other agent endpoints (catch-all)
@router.get(
    "/{path:path}",
    summary="Proxy to agent service",
    description="Generic proxy for other agent endpoints",
    operation_id="agent_get"
)
@router.post("/{path:path}", operation_id="agent_post")
@router.put("/{path:path}", operation_id="agent_put")
@router.delete("/{path:path}", operation_id="agent_delete")
@router.patch("/{path:path}", operation_id="agent_patch")
async def proxy_agent_generic(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Generic proxy for agent service endpoints.
    
    Note: No authorization by default - add fastapiDI as needed.
    """
    try:
        user = getattr(request.state, "user", None)
        
        # Build target URL
        target_url = settings.agent_service_url
        
        # Update request path
        request._url = request.url.replace(path=f"/{path}")
        
        return await proxy_request(request, target_url, client, user=user)
        
    except HTTPException:
        # Re-raise HTTPException
        raise
    except Exception as e:
        logger.error(f"Error proxying request to agent service for path /{path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process request. Please try again later."
        )

