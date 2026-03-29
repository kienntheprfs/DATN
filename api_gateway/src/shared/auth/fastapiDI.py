"""Authorization dependencies for FastAPI routes.

Provides dependency-based authorization following SOLID principles:
- Single Responsibility: Each dependency has one authorization concern
- Open/Closed: Extensible without modifying existing code
- Liskov Substitution: Dependencies can be composed
- Interface Segregation: Minimal dependency interfaces
- Dependency Inversion: Depends on abstractions (request.state.user)
"""
import logging
from typing import List, Type, Callable
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.dependencies import get_db

logger = logging.getLogger(__name__)


async def require_auth(request: Request):
    """Require user to be authenticated.

    Ensures request.state.user exists (set by auth middleware).
    Use as a FastAPI dependency.

    Example:
        @router.get("/me", dependencies=[Depends(require_auth)])
        async def get_me(request: Request):
            ...
    """
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(allowed_roles: List[str]) -> Callable:
    """Create a FastAPI dependency that requires specific roles.

    Args:
        allowed_roles: List of role names (e.g., ["admin", "user"])

    Returns:
        A FastAPI dependency function.

    Raises:
        HTTPException(401): If user is not authenticated
        HTTPException(403): If user doesn't have required role

    Example:
        @router.get("/admin/users", dependencies=[Depends(require_roles(["admin"]))])
        async def list_users():
            ...
    """
    async def role_checker(request: Request):
        user = getattr(request.state, "user", None)
        path = request.url.path
        
        if user is None:
            logger.warning(f"Missing user info for role check: path={path}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_roles = getattr(user, "roles", [])
        has_role = any(role in allowed_roles for role in user_roles)

        logger.debug(f"Role check: path={path}, user={user.email}, user_roles={user_roles}, allowed={allowed_roles}, has_role={has_role}")

        if not has_role:
            logger.warning(f"Insufficient privileges: path={path}, user={user.email}, requires={allowed_roles}, has={user_roles}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {' or '.join(allowed_roles)}",
            )

        return user

    return role_checker


def require_ownership(resource_param: str, model: Type) -> Callable:
    """Create a FastAPI dependency that requires resource ownership (or admin role).

    Args:
        resource_param: Name of the path parameter containing resource ID
        model: SQLModel class to query (e.g., Thread)

    Returns:
        A FastAPI dependency function.

    Raises:
        HTTPException(401): If user is not authenticated
        HTTPException(403): If user doesn't own resource and is not admin
        HTTPException(404): If resource not found

    Example:
        @router.get("/threads/{thread_id}",
                     dependencies=[Depends(require_ownership("thread_id", Thread))])
        async def get_thread(thread_id: str, ...):
            ...

    Note:
        - Admins bypass ownership check
        - Resource must have 'user_id' field
    """
    async def ownership_checker(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        # Check authentication
        user = getattr(request.state, "user", None)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract resource ID from path parameters
        resource_id = request.path_params.get(resource_param)
        if resource_id is None:
            raise RuntimeError(
                f"require_ownership: path parameter '{resource_param}' not found"
            )

        # Admin bypass: admins can access all resources
        user_roles = getattr(user, "roles", [])
        if "admin" in user_roles:
            return user

        # Query resource and check ownership
        stmt = select(model).where(model.id == resource_id)
        result = await db.execute(stmt)
        resource = result.scalar_one_or_none()

        if resource is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{model.__name__} not found",
            )

        # Check ownership via user_id field
        resource_owner_id = getattr(resource, "user_id", None)
        user_id = getattr(user, "id", None)

        if resource_owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You don't own this resource",
            )

        return user

    return ownership_checker
