"""Authorization helpers."""
from typing import Optional
from fastapi import Request, HTTPException, status
from redis.asyncio import Redis

from src.services.opa_service import opa_service
from src.services.cache_service import cache_service
from src.utils.cache_keys import generate_policy_cache_key


async def check_authorization(
    request: Request,
    resource_type: str,
    resource_id: str,
    action: str,
    owner_id: Optional[str] = None
) -> None:
    """
    Check authorization using OPA and raise 403 if denied.
    
    Args:
        request: FastAPI request with user info in state
        resource_type: Type of resource (thread, document, etc)
        resource_id: ID of the resource
        action: Action to perform (read, write, invoke, etc)
        owner_id: Optional owner ID of resource
        
    Raises:
        HTTPException: 403 if authorization denied
    """
    user_id = request.state.user_id
    user_roles = request.state.user_roles
    
    # Get Redis from app state
    redis: Redis = request.app.state.redis
    
    # Check policy cache
    policy_cache_key = generate_policy_cache_key(
        user_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action
    )
    
    cached_decision = await cache_service.get(redis, policy_cache_key)
    
    if cached_decision is not None:
        allowed = cached_decision
    else:
        # Call OPA for authorization decision
        allowed = await opa_service.check_policy(
            user_id=user_id,
            user_roles=user_roles,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            owner_id=owner_id
        )
        
        # Cache the decision
        await cache_service.set(redis, policy_cache_key, allowed)
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions to {action} {resource_type}"
        )
