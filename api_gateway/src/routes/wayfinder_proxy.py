"""Wayfinder service proxy routes with admin-only access.

Implements proxy pattern with role-based authorization following SOLID principles.
All wayfinder service endpoints require admin role.
"""
import logging
from fastapi import APIRouter, Request, Depends, HTTPException, status
import httpx

from src.config import settings
from src.dependencies import get_http_client
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.fastapiDI import require_roles

logger = logging.getLogger(__name__)


# Apply admin_required at router level - all routes in this router require admin
router = APIRouter(
    prefix="/wayfinder",
    tags=["Wayfinder Service"],
    dependencies=[Depends(require_roles(["admin"]))]
)


@router.get(
    "/{path:path}",
    summary="Proxy GET to wayfinder service",
    description="Admin-only access to wayfinder service",
    operation_id="wayfinder_get",
)
@router.post("/{path:path}", operation_id="wayfinder_post")
@router.put("/{path:path}", operation_id="wayfinder_put")
@router.delete("/{path:path}", operation_id="wayfinder_delete")
@router.patch("/{path:path}", operation_id="wayfinder_patch")
async def proxy_to_wayfinder(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Proxy all requests to wayfinder service.
    
    Authorization:
    - Requires admin role (enforced by router-level dependency)
    - All wayfinder service operations are admin-only
    
    Proxies:
    - GET /wayfinder/* -> wayfinder-service/*
    - POST /wayfinder/* -> wayfinder-service/*
    - PUT /wayfinder/* -> wayfinder-service/*
    - DELETE /wayfinder/* -> wayfinder-service/*
    """
    try:
        user = request.state.user
        
        # Build target URL
        target_url = settings.wayfinder_service_url
        
        # Update request path (remove /wayfinder prefix)
        actual_path = f"/{path}" if path else "/"
        request._url = request.url.replace(path=actual_path)
        
        # Inject user headers for downstream service
        request.headers.__dict__["_list"].append(
            (b"x-user-id", user.id.encode())
        )
        request.headers.__dict__["_list"].append(
            (b"x-user-email", user.email.encode())
        )
        request.headers.__dict__["_list"].append(
            (b"x-user-roles", ",".join(user.roles).encode())
        )
        request.headers.__dict__["_list"].append(
            (b"x-internal-secret", settings.internal_secret.encode())
        )
        
        return await proxy_request(request, target_url, client)
        
    except HTTPException:
        # Re-raise HTTPException from fastapiDI (role check)
        raise
    except Exception as e:
        logger.error(f"Error proxying request to wayfinder service for path /{path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later."
        )
