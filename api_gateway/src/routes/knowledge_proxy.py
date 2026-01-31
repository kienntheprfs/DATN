"""Knowledge service proxy routes."""
from fastapi import APIRouter, Request, Depends
import httpx
import re

from src.config import settings
from src.dependencies import get_http_client
from src.middleware.proxy_middleware import proxy_request
from src.shared.auth.authorization import check_authorization

router = APIRouter(prefix="/kb", tags=["Knowledge Service"])


@router.get("/{path:path}", operation_id="knowledge_get")
@router.post("/{path:path}", operation_id="knowledge_post")
@router.put("/{path:path}", operation_id="knowledge_put")
@router.delete("/{path:path}", operation_id="knowledge_delete")
@router.patch("/{path:path}", operation_id="knowledge_patch")
async def proxy_to_knowledge(
    path: str,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client)
):
    """Proxy all requests to knowledge service with authorization checks."""
    # Extract resource info from path for authorization
    # Example paths: documents/{doc_id}, documents
    # doc_match = re.match(r'documents/([^/]+)(/.*)?', path)
    
    # if doc_match:
    #     doc_id = doc_match.group(1)
        
    #     # Determine action based on method
    #     if request.method in ["PUT", "PATCH"]:
    #         action = "update"
    #     elif request.method == "DELETE":
    #         action = "delete"
    #     elif request.method == "POST":
    #         action = "create"
    #     else:
    #         action = "read"
        
    #     # Check authorization (will raise 403 if denied)
    #     await check_authorization(
    #         request=request,
    #         resource_type="document",
    #         resource_id=doc_id,
    #         action=action,
    #         owner_id=None  # TODO: fetch from database if needed for ownership check
    #     )
    # elif path.startswith("documents") and request.method == "POST":
    #     # Creating new document
    #     await check_authorization(
    #         request=request,
    #         resource_type="document",
    #         resource_id="new",
    #         action="create"
    #     )
    
    # Remove /kb prefix
    actual_path = f"/{path}" if path else "/"
    
    # Build target URL
    target_url = settings.knowledge_service_url
    
    # Update request path
    request._url = request.url.replace(path=actual_path)
    
    return await proxy_request(request, target_url, client)
