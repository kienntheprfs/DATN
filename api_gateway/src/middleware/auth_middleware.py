"""Authentication middleware with optional JWT for guest support.

Implements middleware following SOLID principles:
- Single Responsibility: Only handles JWT extraction and validation
- Open/Closed: Extensible via PUBLIC_PATHS and GUEST_ALLOWED_PATHS
- Interface Segregation: Minimal interface (sets request.state.user)
- Dependency Inversion: Depends on jwt_handler abstraction
"""
from typing import Optional
from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from cachetools import TTLCache

from src.shared.auth.jwt_handler import jwt_handler
from src.schemas.user_info import UserInfo


# In-memory cache for JWT validation (replaces Redis for simplicity)
# Cache layout: {token: UserInfo}
jwt_cache = TTLCache(maxsize=1000, ttl=300)  # 1000 tokens, 5 min TTL


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware for JWT authentication with guest support.
    
    Behavior:
    - PUBLIC_PATHS: No auth required, no user info set
    - GUEST_ALLOWED_PATHS: Optional auth, sets user info if JWT present
    - Other paths: Auth required, raises 401 if no JWT
    
    Sets request.state.user to UserInfo or None (for guests).
    """
    
    # Public paths - no authentication required, no user info needed
    PUBLIC_PATHS = [
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",
        "/auth/login",
        "/auth/register",
        "/auth/refresh",
    ]
    
    # Guest-allowed paths - authentication optional
    # If JWT present, user info is set; otherwise request.state.user = None
    GUEST_ALLOWED_PATHS = [
        "/agent/invoke",
    ]
    
    async def dispatch(self, request: Request, call_next):
        """Process request through JWT authentication."""
        path = request.url.path
        
        # Public paths: skip auth, no user info
        # Check exact match first
        if path in self.PUBLIC_PATHS:
            return await call_next(request)
        
        # Check prefix match (skip "/" to avoid matching all paths)
        for public_path in self.PUBLIC_PATHS:
            if public_path != "/" and path.startswith(public_path):
                return await call_next(request)
        
        # Check if guest allowed
        is_guest_allowed = any(path.startswith(p) for p in self.GUEST_ALLOWED_PATHS)
        
        # Extract JWT token
        auth_header = request.headers.get("Authorization")
        
        # If no JWT and auth required, return 401
        if not auth_header or not auth_header.startswith("Bearer "):
            if not is_guest_allowed:
                print(f"[AUTH] 401 - No token: path={path}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Missing or invalid authorization header"},
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                # Guest mode: no user info
                print(f"[AUTH] Guest mode: path={path}")
                request.state.user = None
                return await call_next(request)
        
        token = auth_header.split(" ")[1]
        print(f"[AUTH] Token found: path={path}, token_prefix={token[:20]}...")
        
        # Try cache first
        user_info = jwt_cache.get(token)
        if user_info:
            print(f"[AUTH] Token from cache: {user_info.email}, roles={user_info.roles}")
        
        if user_info is None:
            # Decode and validate JWT
            try:
                token_payload = jwt_handler.decode_token(token)
                print(f"[AUTH] Token decoded: sub={token_payload.sub}, email={token_payload.email}, roles={token_payload.roles}, type={token_payload.type}")
                
                # Verify it's an access token
                if not jwt_handler.verify_token_type(token_payload, "access"):
                    print(f"[AUTH] 401 - Invalid token type: path={path}, type={getattr(token_payload, 'type', 'unknown')}")
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "Invalid token type"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                
                # Create UserInfo from token payload
                user_info = UserInfo(
                    id=token_payload.sub,
                    email=token_payload.email,
                    roles=token_payload.roles,
                )
                print(f"[AUTH] UserInfo created: {user_info.email}, roles={user_info.roles}")
                
                # Cache user info
                jwt_cache[token] = user_info
                
            except ValueError as e:
                print(f"[AUTH] 401 - Token decode error: path={path}, error={str(e)}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": str(e)},
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        # Set user info in request state
        request.state.user = user_info
        print(f"[AUTH] ✓ Authenticated: path={path}, user={user_info.email}, roles={user_info.roles}")
        
        # Process request
        response = await call_next(request)
        
        return response

