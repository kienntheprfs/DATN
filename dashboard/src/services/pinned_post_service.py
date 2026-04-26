"""Business logic for dashboard pinned posts."""

from datetime import date, datetime
from math import ceil
import logging
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import DashboardPinnedPost
from src.repositories.pinned_post_repository import PinnedPostRepository
from src.schemas.pinned_post import (
    PinnedPostAdminListParams,
    PinnedPostAdminListResponse,
    PinnedPostCreate,
    PinnedPostPublicListResponse,
    PinnedPostReorderPayload,
    PinnedPostReorderResponse,
    PinnedPostResponse,
    PinnedPostStats,
    PinnedPostUpdate,
)


logger: logging.Logger = logging.getLogger(__name__)


class PinnedPostService:
    """Orchestrate pinned post workflows and business rules."""

    MAX_ACTIVE_SLOTS: int = 10

    @staticmethod
    def _to_response(item: DashboardPinnedPost) -> PinnedPostResponse:
        return PinnedPostResponse(
            id=item.id,
            order=item.display_order,
            title=item.title,
            ref_id=item.ref_id,
            category=item.category,
            pinned_date=item.pinned_date,
            summary=item.summary,
            source_url=item.source_url,
            document_type=item.document_type,
            tags=item.tags,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    async def list_admin(db: AsyncSession, *, params: PinnedPostAdminListParams) -> PinnedPostAdminListResponse:
        """Return paginated pinned post list with summary metrics."""
        items, total_items = await PinnedPostRepository.list_admin(
            db,
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            category=params.category,
            sort_by=params.sort_by,
        )

        total_pages = ceil(total_items / params.page_size) if total_items > 0 else 0
        all_count = await PinnedPostRepository.count_all(db)
        top_category = await PinnedPostRepository.get_top_category(db)
        last_updated = await PinnedPostRepository.get_last_updated_date(db)

        return PinnedPostAdminListResponse(
            items=[PinnedPostService._to_response(item) for item in items],
            page=params.page,
            page_size=params.page_size,
            total_items=total_items,
            total_pages=total_pages,
            stats=PinnedPostStats(
                total_pins=all_count,
                active_slots=min(all_count, PinnedPostService.MAX_ACTIVE_SLOTS),
                max_slots=PinnedPostService.MAX_ACTIVE_SLOTS,
                top_category=top_category,
                last_updated_date=last_updated,
            ),
        )

    @staticmethod
    async def list_public(
        db: AsyncSession,
        *,
        limit: int,
        sort_by: str,
    ) -> PinnedPostPublicListResponse:
        """Return pinned posts for non-admin users."""
        items = await PinnedPostRepository.list_public(db, limit=limit, sort_by=sort_by)
        return PinnedPostPublicListResponse(
            items=[PinnedPostService._to_response(item) for item in items],
            total_items=len(items),
        )

    @staticmethod
    async def create(db: AsyncSession, *, payload: PinnedPostCreate, user_id: str) -> PinnedPostResponse:
        """Create a pinned post at the top of manual order with generated reference id."""
        try:
            existing_items = await PinnedPostRepository.list_all_manual(db)
            today = date.today()
            ref_id = f"REG-{today.year}-{uuid4().hex[:8].upper()}"
            now = datetime.utcnow()

            # Two-phase shift to avoid unique collisions on display_order.
            for temp_index, item in enumerate(existing_items, start=1):
                item.display_order = -temp_index
                item.updated_at = now
                await PinnedPostRepository.update(db, item)

            await db.flush()

            for final_index, item in enumerate(existing_items, start=2):
                item.display_order = final_index
                await PinnedPostRepository.update(db, item)

            entity = DashboardPinnedPost(
                display_order=1,
                title=payload.title.strip(),
                ref_id=ref_id,
                category=payload.category.value,
                pinned_date=today,
                summary=payload.summary.strip(),
                source_url=payload.source_url.strip(),
                document_type=payload.document_type.strip(),
                tags=[tag.strip().upper() for tag in payload.tags if tag.strip()],
                created_by=user_id,
                created_at=now,
                updated_at=now,
            )
            await PinnedPostRepository.create(db, entity)
            await db.commit()
            await db.refresh(entity)
        except IntegrityError as exc:
            await db.rollback()
            logger.warning("Pinned post conflict", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="pinned post conflicted with existing data",
            ) from exc
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to create pinned post")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to create pinned post",
            ) from exc

        return PinnedPostService._to_response(entity)

    @staticmethod
    async def update(db: AsyncSession, *, post_id: UUID, payload: PinnedPostUpdate) -> PinnedPostResponse:
        """Update editable fields of one pinned post."""
        entity = await PinnedPostRepository.get_by_id(db, post_id)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pinned post not found")

        entity.title = payload.title.strip()
        entity.summary = payload.summary.strip()
        entity.document_type = payload.document_type.strip()
        entity.source_url = payload.source_url.strip()
        entity.category = payload.category.value
        entity.tags = [tag.strip().upper() for tag in payload.tags if tag.strip()]
        entity.updated_at = datetime.utcnow()

        try:
            await PinnedPostRepository.update(db, entity)
            await db.commit()
            await db.refresh(entity)
        except IntegrityError as exc:
            await db.rollback()
            logger.warning("Pinned post update conflict id=%s", post_id, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="pinned post conflicted with existing data",
            ) from exc
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to update pinned post id=%s", post_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to update pinned post",
            ) from exc

        return PinnedPostService._to_response(entity)

    @staticmethod
    async def delete(db: AsyncSession, *, post_id: UUID) -> None:
        """Delete one pinned post and normalize display order."""
        entity = await PinnedPostRepository.get_by_id(db, post_id)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="pinned post not found")

        try:
            await PinnedPostRepository.delete(db, entity)
            await db.flush()
            await PinnedPostRepository.normalize_display_order(db)
            await db.commit()
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to delete pinned post id=%s", post_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to delete pinned post",
            ) from exc

    @staticmethod
    async def reorder(
        db: AsyncSession,
        *,
        payload: PinnedPostReorderPayload,
    ) -> PinnedPostReorderResponse:
        """Persist manual ordering for all pinned posts."""
        existing_items = await PinnedPostRepository.list_all_manual(db)
        existing_ids = [item.id for item in existing_items]
        ordered_ids = payload.ordered_post_ids

        if len(set(ordered_ids)) != len(ordered_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duplicate post ids in reorder payload")

        if set(ordered_ids) != set(existing_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="reorder payload must include all existing pinned post ids",
            )

        item_map = {item.id: item for item in existing_items}
        now = datetime.utcnow()

        try:
            for temp_index, post_id in enumerate(ordered_ids, start=1):
                entity = item_map[post_id]
                entity.display_order = -temp_index
                entity.updated_at = now
                await PinnedPostRepository.update(db, entity)

            await db.flush()

            for order_index, post_id in enumerate(ordered_ids, start=1):
                entity = item_map[post_id]
                entity.display_order = order_index
                await PinnedPostRepository.update(db, entity)

            await db.commit()
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to reorder pinned posts")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to reorder pinned posts",
            ) from exc

        updated_items = await PinnedPostRepository.list_all_manual(db)
        return PinnedPostReorderResponse(
            items=[PinnedPostService._to_response(item) for item in updated_items],
        )
