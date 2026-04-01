"""Voice service proxy routes.

Proxies WebRTC voice requests to the voice service.
"""

import logging
from fastapi import APIRouter, Request, Depends, status, HTTPException
from fastapi.responses import JSONResponse
import httpx

from src.config import settings
from src.dependencies import get_http_client

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/voice", tags=["Voice Service"])


async def proxy_voice_request(
    request: Request,
    client: httpx.AsyncClient,
    target_path: str,
):
    """Proxy voice request to voice service with path mapping."""
    try:
        body = await request.body()

        target_url = f"{settings.voice_service_url}/api{target_path}"

        logger.debug(
            f"Proxying voice request: {request.method} {request.url.path} -> {target_url}"
        )

        response = await client.request(
            method=request.method,
            url=target_url,
            headers=dict(request.headers),
            content=body,
            timeout=30.0,
        )

        return JSONResponse(
            status_code=response.status_code,
            content=response.json() if response.content else {},
        )

    except httpx.TimeoutException:
        logger.error(f"Timeout proxying to voice service")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Voice service timeout",
        )
    except httpx.ConnectError:
        logger.error(f"Connection error to voice service")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice service unavailable",
        )
    except Exception as e:
        logger.error(f"Error proxying voice request: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to proxy voice request",
        )


@router.post("/offer")
async def voice_offer(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    return await proxy_voice_request(request, client, "/offer")


@router.patch("/offer")
async def voice_ice_candidate(
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    return await proxy_voice_request(request, client, "/offer")


@router.get("/health")
async def voice_health(
    client: httpx.AsyncClient = Depends(get_http_client),
):
    try:
        target_url = f"{settings.voice_service_url}/health"
        response = await client.get(target_url)
        return response.json()
    except Exception as e:
        logger.error(f"Error checking voice service health: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice service unavailable",
        )
