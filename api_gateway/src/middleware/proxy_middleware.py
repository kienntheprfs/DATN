"""Proxy middleware for routing requests to downstream services."""
import httpx
from fastapi import Request, Response, Depends
from starlette.background import BackgroundTask
from src.dependencies import get_http_client

from src.config import settings


async def proxy_request(
    request: Request,
    target_url: str,
    client = Depends(get_http_client)
) -> Response:
    """
    Proxy request to downstream service.
    
    Args:
        request: Incoming FastAPI request
        target_url: Target service URL
        client: HTTP client
        
    Returns:
        Response from downstream service
    """
    # Build target URL
    path = request.url.path
    query_params = str(request.url.query)
    full_url = f"{target_url}{path}"
    if query_params:
        full_url = f"{full_url}?{query_params}"
    
    # Get request body
    body = await request.body()
    
    # Prepare headers to forward
    headers = dict(request.headers)
    
    # Remove host header (will be set by httpx)
    headers.pop("host", None)
    
    # Add internal authentication headers
    headers["X-Internal-Secret"] = settings.internal_secret
    
    # Add user context headers from middleware
    if hasattr(request.state, "user_id"):
        headers["X-User-ID"] = request.state.user_id
        headers["X-User-Email"] = request.state.user_email
        headers["X-User-Roles"] = ",".join(request.state.user_roles)
    
    # Make request to downstream service
    try:
        response = await client.request(
            method=request.method,
            url=full_url,
            headers=headers,
            content=body,
            timeout=30.0,
        )
        
        # Prepare response headers
        response_headers = dict(response.headers)
        # Remove headers that shouldn't be forwarded
        response_headers.pop("content-encoding", None)
        response_headers.pop("content-length", None)
        response_headers.pop("transfer-encoding", None)
        
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=response_headers,
        )
    
    except httpx.RequestError as e:
        return Response(
            content=f'{{"error": "Service unavailable: {str(e)}"}}',
            status_code=503,
            media_type="application/json",
        )
