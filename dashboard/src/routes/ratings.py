"""HTTP routes for answer rating feature."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.schemas.rating import RatingCreate, RatingResponse, RatingStats
from src.services.rating_service import RatingService


router: APIRouter = APIRouter(prefix="/ratings", tags=["Ratings"])


def _parse_roles(raw_roles: str | None) -> list[str]:
    """Parse CSV roles from trusted header."""
    if not raw_roles:
        return []
    return [role.strip().lower() for role in raw_roles.split(",") if role.strip()]


def _require_user_id(user_id: str | None) -> str:
    """Validate trusted user id header."""
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing user identity")
    return user_id


@router.post("", response_model=RatingResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_rating(
    rating_data: RatingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> RatingResponse:
    """Create or update one rating for caller and run id."""
    user_id: str = _require_user_id(x_user_id)
    return await RatingService.create_or_update(db, user_id=user_id, rating_data=rating_data)


@router.delete("/{rating_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rating(
    rating_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> Response:
    """Delete rating by id (owner/admin only)."""
    user_id: str = _require_user_id(x_user_id)
    is_admin: bool = "admin" in _parse_roles(x_user_roles)
    await RatingService.delete(db, rating_id=rating_id, user_id=user_id, is_admin=is_admin)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/thread/{thread_id}", response_model=list[RatingResponse])
async def get_thread_ratings(
    thread_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> list[RatingResponse]:
    """Get ratings in a thread; regular users only see their own ratings."""
    user_id: str = _require_user_id(x_user_id)
    is_admin: bool = "admin" in _parse_roles(x_user_roles)
    return await RatingService.get_thread_ratings(db, thread_id=thread_id, user_id=user_id, is_admin=is_admin)


@router.get("/stats/agent/{agent_id}", response_model=RatingStats)
async def get_agent_rating_stats(
    agent_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> RatingStats:
    """Get agent-level rating stats (admin only)."""
    _require_user_id(x_user_id)
    is_admin: bool = "admin" in _parse_roles(x_user_roles)
    if not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin role required")
    return await RatingService.get_agent_stats(db, agent_id=agent_id)