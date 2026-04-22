"""HTTP routes for dashboard pinned post management."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import PinnedPostCategory
from src.schemas.pinned_post import (
    PinnedPostAdminListParams,
    PinnedPostAdminListResponse,
    PinnedPostCreate,
    PinnedPostPublicListResponse,
    PinnedPostReorderPayload,
    PinnedPostReorderResponse,
    PinnedPostResponse,
    PinnedPostUpdate,
)
from src.services.pinned_post_service import PinnedPostService


router: APIRouter = APIRouter(prefix="/pinned-posts", tags=["Pinned Posts"])


def _parse_roles(raw_roles: str | None) -> list[str]:
    """Parse CSV roles from trusted auth gateway header."""
    if not raw_roles:
        return []
    return [role.strip().lower() for role in raw_roles.split(",") if role.strip()]


def _require_user_id(user_id: str | None) -> str:
    """Validate trusted user id header."""
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing user identity")
    return user_id


def _require_admin(raw_roles: str | None) -> None:
    """Enforce admin role for pinned post management."""
    if "admin" not in _parse_roles(raw_roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin role required")


@router.get("/admin", response_model=PinnedPostAdminListResponse)
async def list_admin_pinned_posts(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 4,
    search: str | None = None,
    category: PinnedPostCategory | None = None,
    sort_by: str = "latest",
) -> PinnedPostAdminListResponse:
    """Return paginated pinned posts for admin table and cards."""
    _require_user_id(x_user_id)
    _require_admin(x_user_roles)

    params = PinnedPostAdminListParams(
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        sort_by=sort_by,
    )
    return await PinnedPostService.list_admin(db, params=params)


@router.get("", response_model=PinnedPostPublicListResponse)
async def list_public_pinned_posts(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    sort_by: str = "manual",
) -> PinnedPostPublicListResponse:
    """Return pinned posts for main user-facing page."""
    return await PinnedPostService.list_public(db, limit=limit, sort_by=sort_by)


@router.post("", response_model=PinnedPostResponse, status_code=status.HTTP_201_CREATED)
async def create_pinned_post(
    payload: PinnedPostCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> PinnedPostResponse:
    """Create a pinned post."""
    user_id = _require_user_id(x_user_id)
    _require_admin(x_user_roles)
    return await PinnedPostService.create(db, payload=payload, user_id=user_id)


@router.put("/reorder", response_model=PinnedPostReorderResponse)
async def reorder_pinned_posts(
    payload: PinnedPostReorderPayload,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> PinnedPostReorderResponse:
    """Save manual order for pinned posts."""
    _require_user_id(x_user_id)
    _require_admin(x_user_roles)
    return await PinnedPostService.reorder(db, payload=payload)


@router.put("/{post_id}", response_model=PinnedPostResponse)
async def update_pinned_post(
    post_id: UUID,
    payload: PinnedPostUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> PinnedPostResponse:
    """Update one pinned post."""
    _require_user_id(x_user_id)
    _require_admin(x_user_roles)
    return await PinnedPostService.update(db, post_id=post_id, payload=payload)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pinned_post(
    post_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    x_user_roles: Annotated[str | None, Header(alias="X-User-Roles")] = None,
) -> Response:
    """Delete one pinned post."""
    _require_user_id(x_user_id)
    _require_admin(x_user_roles)
    await PinnedPostService.delete(db, post_id=post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
