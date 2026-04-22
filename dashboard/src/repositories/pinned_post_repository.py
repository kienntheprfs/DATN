"""Repository methods for dashboard pinned posts."""

from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import asc, desc, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.models import DashboardPinnedPost, PinnedPostCategory


class PinnedPostRepository:
    """Encapsulate persistence operations for pinned posts."""

    @staticmethod
    async def get_by_id(db: AsyncSession, post_id: UUID) -> Optional[DashboardPinnedPost]:
        """Return one pinned post by id."""
        statement = select(DashboardPinnedPost).where(DashboardPinnedPost.id == post_id)
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_max_display_order(db: AsyncSession) -> int:
        """Return current max display order or zero when table is empty."""
        statement = select(func.max(DashboardPinnedPost.display_order))
        result = await db.execute(statement)
        return int(result.scalar_one() or 0)

    @staticmethod
    async def create(db: AsyncSession, post: DashboardPinnedPost) -> DashboardPinnedPost:
        """Add a new pinned post to active session."""
        db.add(post)
        return post

    @staticmethod
    async def update(db: AsyncSession, post: DashboardPinnedPost) -> DashboardPinnedPost:
        """Attach updated pinned post to active session."""
        db.add(post)
        return post

    @staticmethod
    async def delete(db: AsyncSession, post: DashboardPinnedPost) -> None:
        """Delete pinned post from active session."""
        await db.delete(post)

    @staticmethod
    def _build_filters(statement, *, search: str | None, category: PinnedPostCategory | None):
        if search:
            pattern = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    DashboardPinnedPost.title.ilike(pattern),
                    DashboardPinnedPost.ref_id.ilike(pattern),
                )
            )

        if category is not None:
            statement = statement.where(DashboardPinnedPost.category == category.value)

        return statement

    @staticmethod
    def _resolve_order_by(sort_by: str):
        if sort_by == "alphabetical":
            return [asc(DashboardPinnedPost.title), asc(DashboardPinnedPost.id)]
        if sort_by == "manual":
            return [asc(DashboardPinnedPost.display_order), asc(DashboardPinnedPost.id)]
        return [desc(DashboardPinnedPost.pinned_date), desc(DashboardPinnedPost.id)]

    @staticmethod
    async def list_admin(
        db: AsyncSession,
        *,
        page: int,
        page_size: int,
        search: str | None,
        category: PinnedPostCategory | None,
        sort_by: str,
    ) -> tuple[list[DashboardPinnedPost], int]:
        """Return filtered and paginated pinned posts for admin view."""
        base = select(DashboardPinnedPost)
        filtered = PinnedPostRepository._build_filters(base, search=search, category=category)

        count_statement = select(func.count(DashboardPinnedPost.id))
        count_statement = PinnedPostRepository._build_filters(count_statement, search=search, category=category)
        total_items_result = await db.execute(count_statement)
        total_items = int(total_items_result.scalar_one() or 0)

        offset = (page - 1) * page_size
        order_by = PinnedPostRepository._resolve_order_by(sort_by)
        result = await db.execute(filtered.order_by(*order_by).offset(offset).limit(page_size))
        items = list(result.scalars().all())
        return items, total_items

    @staticmethod
    async def count_all(db: AsyncSession) -> int:
        """Return total pinned posts count."""
        result = await db.execute(select(func.count(DashboardPinnedPost.id)))
        return int(result.scalar_one() or 0)

    @staticmethod
    async def get_top_category(db: AsyncSession) -> PinnedPostCategory | None:
        """Return category with highest post count."""
        statement = (
            select(DashboardPinnedPost.category, func.count(DashboardPinnedPost.id).label("total"))
            .group_by(DashboardPinnedPost.category)
            .order_by(desc("total"), asc(DashboardPinnedPost.category))
            .limit(1)
        )
        row = (await db.execute(statement)).first()
        if row is None:
            return None
        return PinnedPostCategory(row[0])

    @staticmethod
    async def get_last_updated_date(db: AsyncSession) -> date | None:
        """Return latest pinned date across pinned posts."""
        statement = select(func.max(DashboardPinnedPost.pinned_date))
        value = (await db.execute(statement)).scalar_one_or_none()
        if value is None:
            return None
        return value

    @staticmethod
    async def normalize_display_order(db: AsyncSession) -> None:
        """Re-sequence display order to keep manual sorting deterministic."""
        statement = select(DashboardPinnedPost).order_by(
            asc(DashboardPinnedPost.display_order),
            asc(DashboardPinnedPost.created_at),
            asc(DashboardPinnedPost.id),
        )
        items = list((await db.execute(statement)).scalars().all())
        for index, item in enumerate(items, start=1):
            if item.display_order != index:
                item.display_order = index
                db.add(item)

    @staticmethod
    async def list_public(
        db: AsyncSession,
        *,
        limit: int,
        sort_by: str,
    ) -> list[DashboardPinnedPost]:
        """Return pinned posts for public main-page rendering."""
        order_by = PinnedPostRepository._resolve_order_by(sort_by)
        statement = select(DashboardPinnedPost).order_by(*order_by).limit(limit)
        result = await db.execute(statement)
        return list(result.scalars().all())

    @staticmethod
    async def list_all_manual(db: AsyncSession) -> list[DashboardPinnedPost]:
        """Return all pinned posts ordered by manual display order."""
        statement = select(DashboardPinnedPost).order_by(
            asc(DashboardPinnedPost.display_order),
            asc(DashboardPinnedPost.id),
        )
        result = await db.execute(statement)
        return list(result.scalars().all())
