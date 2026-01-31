"""Authorization middleware using OPA."""
from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from redis.asyncio import Redis

from src.shared.auth.jwt_handler import jwt_handler
from src.services.opa_service import opa_service
from src.services.cache_service import cache_service
from src.utils.cache_keys import generate_policy_cache_key, generate_jwt_cache_key


class AuthorizationMiddleware(BaseHTTPMiddleware):
    """Middleware for JWT validation and OPA authorization."""
    
    # Public paths that don't require authentication
    PUBLIC_PATHS = [
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",
        "/auth/login",
        "/auth/register",
        "/auth/refresh",
    ]
    
    async def dispatch(self, request: Request, call_next):
        """Process request through auth and authorization."""
        path = request.url.path
        # Exact match for root, prefix match for others
        if path == "/" or any(path.startswith(p) for p in self.PUBLIC_PATHS):
            return await call_next(request)
        
        # Extract JWT token
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing or invalid authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        token = auth_header.split(" ")[1]
        
        # Get Redis connection from app state
        redis: Redis = request.app.state.redis
        
        # Check JWT cache
        jwt_cache_key = generate_jwt_cache_key(token)
        cached_token_data = await cache_service.get(redis, jwt_cache_key)
        
        if cached_token_data:
            token_payload = cached_token_data
        else:
            # Decode and validate JWT
            try:
                token_payload = jwt_handler.decode_token(token)
                
                # Verify it's an access token
                if not jwt_handler.verify_token_type(token_payload, "access"):
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "Invalid token type"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                
                # Cache token payload
                await cache_service.set(
                    redis,
                    jwt_cache_key,
                    token_payload.model_dump()
                )
            except ValueError as e:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": str(e)},
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        # Add user info to request state
        request.state.user_id = token_payload.get("sub") if isinstance(token_payload, dict) else token_payload.sub
        request.state.user_email = token_payload.get("email") if isinstance(token_payload, dict) else token_payload.email
        request.state.user_roles = token_payload.get("roles", []) if isinstance(token_payload, dict) else token_payload.roles
        
        # Process request
        response = await call_next(request)
        
        return response
