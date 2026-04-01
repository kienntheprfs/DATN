"""Authentication middleware with optional JWT parsing.

This middleware only extracts/validates JWT and sets request.state.user.
Authorization (public/private/ownership/roles) is enforced by route dependencies.
"""
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from cachetools import TTLCache

from src.shared.auth.jwt_handler import jwt_handler
from src.schemas.user_info import UserInfo

logger = logging.getLogger(__name__)


# In-memory cache for JWT validation (replaces Redis for simplicity)
# Cache layout: {token: UserInfo}
jwt_cache = TTLCache(maxsize=1000, ttl=300)  # 1000 tokens, 5 min TTL


class AuthMiddleware(BaseHTTPMiddleware):
    """Optional-auth middleware.

    - Missing Authorization header: request.state.user = None
    - Invalid Authorization header/token: request.state.user = None
    - Valid access token: request.state.user = UserInfo

    Route dependencies are responsible for returning 401/403 where required.
    """
    
    async def dispatch(self, request: Request, call_next):
        """Process request through JWT authentication."""
        path = request.url.path

        # Default to guest until a valid access token is parsed.
        request.state.user = None

        # Extract JWT token (optional for every route).
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            logger.debug(f"Guest request (no Authorization header): path={path}")
            return await call_next(request)

        if not auth_header.startswith("Bearer "):
            logger.debug(f"Ignoring non-Bearer Authorization header: path={path}")
            return await call_next(request)
        
        token = auth_header.split(" ")[1]
        logger.debug(f"Token found: path={path}, token_prefix={token[:20]}...")
        
        # Try cache first
        user_info = jwt_cache.get(token)
        if user_info:
            logger.debug(f"Token from cache: {user_info.email}, roles={user_info.roles}")
        
        if user_info is None:
            # Decode and validate JWT
            try:
                token_payload = jwt_handler.decode_token(token)
                logger.debug(f"Token decoded: sub={token_payload.sub}, email={token_payload.email}, roles={token_payload.roles}, type={token_payload.type}")
                
                # Verify it's an access token
                if not jwt_handler.verify_token_type(token_payload, "access"):
                    logger.warning(
                        "Ignoring non-access token: path=%s, type=%s",
                        path,
                        getattr(token_payload, "type", "unknown"),
                    )
                    return await call_next(request)
                
                # Create UserInfo from token payload
                user_info = UserInfo(
                    id=token_payload.sub,
                    email=token_payload.email,
                    roles=token_payload.roles,
                )
                logger.debug(f"UserInfo created: {user_info.email}, roles={user_info.roles}")
                
                # Cache user info
                jwt_cache[token] = user_info
                
            except ValueError as e:
                logger.warning(f"Ignoring invalid token: path={path}, error={str(e)}")
                return await call_next(request)
        
        # Set user info in request state
        request.state.user = user_info
        logger.info(f"Authenticated successfully: path={path}, user={user_info.email}, roles={user_info.roles}")
        
        return await call_next(request)

