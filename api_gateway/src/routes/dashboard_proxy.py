"""Ratings service proxy routes with mixed authorization.

Implements proxy pattern with role-based authorization following SOLID principles:
- Admin-only routes: /ratings/stats/agent/{agent_id}
- Public authenticated routes: POST/DELETE /ratings, GET /ratings/thread/{thread_id}
"""
import logging
from fastapi import APIRouter, Request, Depends, HTTPException, status
import httpx

from src.config import settings
from src.dependencies import get_http_client
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.fastapiDI import require_auth, require_roles

logger = logging.getLogger(__name__)


router: APIRouter = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard Service"]
)


@router.get(
    "/ratings/stats/agent/{agent_id}",
    summary="Get agent rating stats",
    description="Admin-only access to agent rating statistics",
    operation_id="ratings_get_agent_stats"
)
async def get_agent_rating_stats_proxy(
    agent_id: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
    _: str = Depends(require_roles(["admin"])),
):
    """Proxy admin-only request to get agent rating statistics.
    
    Authorization:
    - Requires admin role
    
    Proxies:
    - GET /ratings/stats/agent/{agent_id} -> dashboard-service/ratings/stats/agent/{agent_id}
    """
    try:
        user = request.state.user
        target_url = settings.dashboard_service_url
        
        # Build target path
        actual_path = f"/ratings/stats/agent/{agent_id}"
        request._url = request.url.replace(path=actual_path)

        return await proxy_request(request, target_url, client, user=user)
        
    except HTTPException:
        # Re-raise HTTPException if authorization fails
        raise
    except Exception as e:
        logger.error(f"Error proxying request to ratings service for agent {agent_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process ratings service request. Please try again later."
        )


@router.post(
    "/ratings",
    summary="Create or update rating",
    description="Public authenticated access to create/update rating",
    operation_id="ratings_create_update"
)
async def create_or_update_rating_proxy(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
    _: None = Depends(require_auth),
):
    """Proxy public authenticated request to create or update rating.
    
    Authorization:
    - Requires authentication (valid X-User-Id header)
    
    Proxies:
    - POST /ratings -> dashboard-service/ratings
    """
    try:
        user = request.state.user
        target_url = settings.dashboard_service_url
        
        actual_path = "/ratings"
        request._url = request.url.replace(path=actual_path)

        return await proxy_request(request, target_url, client, user=user)
        
    except Exception as e:
        logger.error(f"Error proxying create/update rating request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create/update rating. Please try again later."
        )


@router.delete(
    "/ratings/{rating_id}",
    summary="Delete rating",
    description="Public authenticated access to delete rating (owner/admin only)",
    operation_id="ratings_delete"
)
async def delete_rating_proxy(
    rating_id: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
    _: None = Depends(require_auth),
):
    """Proxy public authenticated request to delete rating.
    
    Authorization:
    - Requires authentication
    - Server-side authorization: owner or admin can delete
    
    Proxies:
    - DELETE /ratings/{rating_id} -> dashboard-service/ratings/{rating_id}
    """
    try:
        user = request.state.user
        target_url = settings.dashboard_service_url
        
        actual_path = f"/ratings/{rating_id}"
        request._url = request.url.replace(path=actual_path)

        return await proxy_request(request, target_url, client, user=user)
        
    except Exception as e:
        logger.error(f"Error proxying delete rating request for {rating_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete rating. Please try again later."
        )


@router.get(
    "/ratings/thread/{thread_id}",
    summary="Get thread ratings",
    description="Public authenticated access to get thread ratings",
    operation_id="ratings_get_thread"
)
async def get_thread_ratings_proxy(
    thread_id: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
    _: None = Depends(require_auth),
):
    """Proxy public authenticated request to get thread ratings.
    
    Authorization:
    - Requires authentication
    - Server-side authorization: regular users see their own ratings only, admins see all
    
    Proxies:
    - GET /ratings/thread/{thread_id} -> dashboard-service/ratings/thread/{thread_id}
    """
    try:
        user = request.state.user
        target_url = settings.dashboard_service_url
        
        actual_path = f"/ratings/thread/{thread_id}"
        request._url = request.url.replace(path=actual_path)

        return await proxy_request(request, target_url, client, user=user)
        
    except Exception as e:
        logger.error(f"Error proxying get thread ratings request for {thread_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve thread ratings. Please try again later."
        )
