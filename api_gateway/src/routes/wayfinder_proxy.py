"""Wayfinder service proxy routes with mixed public and admin access."""
import logging
from fastapi import APIRouter, Request, Depends, HTTPException, status
import httpx

from src.config import settings
from src.dependencies import get_http_client
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.fastapiDI import require_roles

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/wayfinder",
    tags=["Wayfinder Service"]
)

PUBLIC_WAYFINDER_PATHS = {
    "/api/missing-locations",
    "/api/missing-routes",
    "/api/refresh-cache",
}


async def _proxy_wayfinder(
    downstream_path: str,
    request: Request,
    client: httpx.AsyncClient,
):
    """Proxy helper for all wayfinder endpoints."""
    target_url = settings.wayfinder_service_url
    request._url = request.url.replace(path=downstream_path)
    user = getattr(request.state, "user", None)
    return await proxy_request(request, target_url, client, user=user)


# Public endpoints (no admin role required)
@router.post(
    "/api/missing-locations",
    summary="Public wayfinder missing-locations",
    description="Public endpoint proxied to wayfinder service",
    operation_id="wayfinder_missing_locations_public",
)
async def wayfinder_missing_locations_public(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    try:
        return await _proxy_wayfinder("/api/missing-locations", request, client)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error proxying public wayfinder endpoint /api/missing-locations: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later.",
        )


@router.post(
    "/api/missing-routes",
    summary="Public wayfinder missing-routes",
    description="Public endpoint proxied to wayfinder service",
    operation_id="wayfinder_missing_routes_public",
)
async def wayfinder_missing_routes_public(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    try:
        return await _proxy_wayfinder("/api/missing-routes", request, client)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error proxying public wayfinder endpoint /api/missing-routes: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later.",
        )


@router.post(
    "/api/refresh-cache",
    summary="Public wayfinder refresh-cache",
    description="Public endpoint proxied to wayfinder service",
    operation_id="wayfinder_refresh_cache_public",
)
async def wayfinder_refresh_cache_public(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    try:
        return await _proxy_wayfinder("/api/refresh-cache", request, client)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error proxying public wayfinder endpoint /api/refresh-cache: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later.",
        )


# Public GET endpoint (all wayfinder GET requests)
@router.get("/{path:path}", operation_id="wayfinder_get_public")
async def proxy_to_wayfinder_get(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Proxy all wayfinder GET requests as public endpoints."""
    try:
        actual_path = f"/{path}" if path else "/"
        return await _proxy_wayfinder(actual_path, request, client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying public GET request to wayfinder for path /{path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later."
        )


# Admin endpoints (non-GET wayfinder paths)
@router.post("/{path:path}", operation_id="wayfinder_post_admin", dependencies=[Depends(require_roles(["admin"]))])
@router.put("/{path:path}", operation_id="wayfinder_put_admin", dependencies=[Depends(require_roles(["admin"]))])
@router.delete("/{path:path}", operation_id="wayfinder_delete_admin", dependencies=[Depends(require_roles(["admin"]))])
@router.patch("/{path:path}", operation_id="wayfinder_patch_admin", dependencies=[Depends(require_roles(["admin"]))])
async def proxy_to_wayfinder(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """Proxy admin-only non-GET wayfinder requests (except explicit public paths)."""
    try:
        actual_path = f"/{path}" if path else "/"
        if actual_path in PUBLIC_WAYFINDER_PATHS:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Use the dedicated public endpoint for this path.",
            )

        return await _proxy_wayfinder(actual_path, request, client)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying request to wayfinder service for path /{path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process wayfinder service request. Please try again later."
        )
