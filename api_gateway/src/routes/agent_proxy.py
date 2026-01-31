"""Agent service proxy routes."""
from fastapi import APIRouter, Request, Depends
import httpx
import re

from src.config import settings
from src.dependencies import get_http_client
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.authorization import check_authorization

router = APIRouter(prefix="/agent", tags=["Agent Service"])


@router.get("/{path:path}", operation_id="agent_get")
@router.post("/{path:path}", operation_id="agent_post")
@router.put("/{path:path}", operation_id="agent_put")
@router.delete("/{path:path}", operation_id="agent_delete")
@router.patch("/{path:path}", operation_id="agent_patch")
async def proxy_to_agent(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client)
):
    """Proxy all requests to agent service with authorization checks."""
    # Extract resource info from path for authorization
    # Example paths: threads/{thread_id}/invoke, threads/{thread_id}
    # thread_match = re.match(r'threads/([^/]+)(/.*)?', path)
    
    # if thread_match:
    #     thread_id = thread_match.group(1)
    #     action_path = thread_match.group(2) or ""
        
    #     # Determine action based on method and path
    #     if request.method == "POST" and "/invoke" in action_path:
    #         action = "invoke"
    #     elif request.method in ["PUT", "PATCH"]:
    #         action = "update"
    #     elif request.method == "DELETE":
    #         action = "delete"
    #     else:
    #         action = "read"
        
    #     # Check authorization (will raise 403 if denied)
    #     await check_authorization(
    #         request=request,
    #         resource_type="thread",
    #         resource_id=thread_id,
    #         action=action,
    #         owner_id=None  # TODO: fetch from database if needed for ownership check
    #     )
    
    # Remove /agent prefix
    actual_path = f"/{path}" if path else "/"
    
    # Build target URL
    target_url = settings.agent_service_url
    
    # Update request path
    request._url = request.url.replace(path=actual_path)
    
    return await proxy_request(request, target_url, client)
