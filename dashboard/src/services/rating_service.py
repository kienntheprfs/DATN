"""Business logic for answer ratings."""

from datetime import datetime
import logging
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import AnswerRating, RatingValue
from src.repositories.rating_repository import RatingRepository
from src.schemas.rating import RatingCreate, RatingResponse, RatingStats


logger: logging.Logger = logging.getLogger(__name__)


class RatingService:
    """Orchestrate rating workflows and business validations."""

    @staticmethod
    async def create_or_update(db: AsyncSession, user_id: str, rating_data: RatingCreate) -> RatingResponse:
        """Create a new rating or update existing user rating for the same run."""
        RatingService._validate_comment(rating_data.rating, rating_data.comment)

        run_id: str = str(rating_data.run_id)
        existing: Optional[AnswerRating] = await RatingRepository.get_by_user_run(db, user_id, run_id)
        now: datetime = datetime.utcnow()

        if existing is not None:
            existing.rating = rating_data.rating.value
            existing.comment = rating_data.comment if rating_data.rating == RatingValue.DISLIKE else None
            existing.updated_at = now
            await RatingRepository.update(db, existing)
            entity = existing
        else:
            entity = AnswerRating(
                user_id=user_id,
                run_id=run_id,
                rating=rating_data.rating.value,
                comment=rating_data.comment if rating_data.rating == RatingValue.DISLIKE else None,
                thread_id=rating_data.thread_id,
                agent_id=rating_data.agent_id,
                created_at=now,
                updated_at=now,
            )
            await RatingRepository.create(db, entity)

        try:
            await db.commit()
            await db.refresh(entity)
        except IntegrityError as exc:
            await db.rollback()
            logger.warning("Rating conflict for user_id=%s run_id=%s", user_id, run_id, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="rating already exists for this user and answer",
            ) from exc
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to create/update rating")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to process rating request",
            ) from exc

        return RatingResponse.model_validate(entity)

    @staticmethod
    async def delete(db: AsyncSession, rating_id: UUID, user_id: str, is_admin: bool) -> None:
        """Delete one rating if caller is owner or admin."""
        rating: Optional[AnswerRating] = await RatingRepository.get_by_id(db, rating_id)
        if rating is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="rating not found")

        if rating.user_id != user_id and not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

        try:
            await RatingRepository.delete(db, rating)
            await db.commit()
        except Exception as exc:  # pragma: no cover
            await db.rollback()
            logger.exception("Failed to delete rating_id=%s", rating_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to delete rating",
            ) from exc

    @staticmethod
    async def get_thread_ratings(
        db: AsyncSession,
        thread_id: str,
        user_id: str,
        is_admin: bool,
    ) -> list[RatingResponse]:
        """Return thread ratings according to caller permissions."""
        scoped_user_id: Optional[str] = None if is_admin else user_id
        ratings = await RatingRepository.get_thread_ratings(db, thread_id=thread_id, user_id=scoped_user_id)
        return [RatingResponse.model_validate(item) for item in ratings]

    @staticmethod
    async def get_agent_stats(db: AsyncSession, agent_id: str) -> RatingStats:
        """Return aggregate stats for one agent."""
        total, like_count, dislike_count = await RatingRepository.get_agent_stats(db, agent_id)
        like_percentage: float = (like_count / total * 100.0) if total > 0 else 0.0
        return RatingStats(
            total=total,
            like_count=like_count,
            dislike_count=dislike_count,
            like_percentage=round(like_percentage, 2),
        )

    @staticmethod
    def _validate_comment(rating: RatingValue, comment: Optional[str]) -> None:
        """Validate comment business constraints."""
        if comment is not None and len(comment) > 1000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="comment length must be <= 1000",
            )
        if rating != RatingValue.DISLIKE and comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="comment is only allowed when rating is DISLIKE",
            )