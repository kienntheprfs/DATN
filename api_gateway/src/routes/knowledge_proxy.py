"""Knowledge service proxy routes with admin-only access.

Implements proxy pattern with role-based authorization following SOLID principles.
All knowledge service endpoints require admin role.
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
    prefix="/kb",
    tags=["Knowledge Service"],
    dependencies=[Depends(require_roles(["admin"]))]
)


@router.get(
    "/{path:path}",
    summary="Proxy GET to knowledge service",
    description="Admin-only access to knowledge service",
    operation_id="knowledge_get"
)
@router.post("/{path:path}", operation_id="knowledge_post")
@router.put("/{path:path}", operation_id="knowledge_put")
@router.delete("/{path:path}", operation_id="knowledge_delete")
@router.patch("/{path:path}", operation_id="knowledge_patch")
async def proxy_to_knowledge(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Proxy all requests to knowledge service.
    
    Authorization:
    - Requires admin role (enforced by router-level dependency)
    - All knowledge service operations are admin-only
    
    Proxies:
    - GET /kb/documents -> knowledge-service/documents
    - POST /kb/documents -> knowledge-service/documents
    - PUT /kb/documents/{id} -> knowledge-service/documents/{id}
    - DELETE /kb/documents/{id} -> knowledge-service/documents/{id}
    """
    try:
        user = request.state.user
        
        # Build target URL
        target_url = settings.knowledge_service_url
        
        # Update request path (remove /kb prefix)
        actual_path = f"/{path}" if path else "/"
        request._url = request.url.replace(path=actual_path)

        return await proxy_request(request, target_url, client, user=user)
        
    except HTTPException:
        # Re-raise HTTPException from fastapiDI (role check)
        raise
    except Exception as e:
        logger.error(f"Error proxying request to knowledge service for path /{path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process knowledge service request. Please try again later."
        )
