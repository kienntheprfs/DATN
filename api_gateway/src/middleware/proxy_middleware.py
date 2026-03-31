"""Proxy middleware for routing requests to downstream services."""
import logging
import httpx
from fastapi import Request, Response, Depends
from starlette.background import BackgroundTask
from src.dependencies import get_http_client

from src.utils.proxy_headers import build_downstream_headers

logger = logging.getLogger(__name__)


async def proxy_request(
    request: Request,
    target_url: str,
    client=Depends(get_http_client),
    user=None,
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
    
    # Build downstream headers in one place for all proxy routes.
    headers = build_downstream_headers(request, user=user)
    
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
    
    except httpx.TimeoutException as e:
        logger.error(f"Timeout proxying to {target_url}: {str(e)}")
        return Response(
            content='{"detail": "Request timeout. The service took too long to respond."}',
            status_code=504,
            media_type="application/json",
        )
    
    except httpx.ConnectError as e:
        logger.error(f"Connection error proxying to {target_url}: {str(e)}")
        return Response(
            content='{"detail": "Service unavailable. Unable to connect to the service."}',
            status_code=503,
            media_type="application/json",
        )
    
    except httpx.RequestError as e:
        logger.error(f"Request error proxying to {target_url}: {str(e)}")
        return Response(
            content=f'{{"detail": "Service error: {type(e).__name__}"}}',
            status_code=503,
            media_type="application/json",
        )
    
    except Exception as e:
        logger.error(f"Unexpected error proxying to {target_url}: {str(e)}", exc_info=True)
        return Response(
            content='{"detail": "An unexpected error occurred while processing your request."}',
            status_code=500,
            media_type="application/json",
        )
