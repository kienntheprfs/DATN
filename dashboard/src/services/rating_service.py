"""Business logic for answer ratings."""

from datetime import date, datetime
import asyncio
from math import ceil
import logging
from typing import Optional
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.models import AnswerRating, RatingValue
from src.repositories.rating_repository import RatingRepository
from src.schemas.rating import DailyRatingStat, RatingAdminListItem, RatingAdminListParams, RatingAdminListResponse, RatingAdminStatsResponse, RatingCreate, RatingResponse, RatingStats, DislikeReasonStat


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

        return RatingResponse(
            id=entity.id,
            user_id=entity.user_id,
            run_id=entity.run_id,
            rating=RatingValue(entity.rating),
            comment=entity.comment,
            thread_id=entity.thread_id,
            agent_id=entity.agent_id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )

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
        return [
            RatingResponse(
                id=item.id,
                user_id=item.user_id,
                run_id=item.run_id,
                rating=RatingValue(item.rating),
                comment=item.comment,
                thread_id=item.thread_id,
                agent_id=item.agent_id,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in ratings
        ]

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
    async def list_admin_ratings(
        db: AsyncSession,
        *,
        params: RatingAdminListParams,
    ) -> RatingAdminListResponse:
        """Return filtered and paginated ratings for admin management page."""
        items, total_items = await RatingRepository.list_admin_ratings(
            db,
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            rating=params.rating,
            from_date=params.from_date,
            to_date=params.to_date,
            sort_by=params.sort_by,
        )

        history_map = await RatingService._fetch_histories_for_items(items)
        thread_name_map, user_name_map = await RatingRepository.get_thread_user_metadata(
            db,
            thread_ids={item.thread_id for item in items if item.thread_id},
            user_ids={item.user_id for item in items if item.user_id},
        )

        total_pages = ceil(total_items / params.page_size) if total_items > 0 else 0
        typed_items: list[RatingAdminListItem] = []
        for item in items:
            question, answer = RatingService._extract_question_answer(
                history_map.get((item.thread_id, item.user_id), []),
                item.run_id,
            )
            typed_items.append(
                RatingAdminListItem(
                    id=item.id,
                    user_id=item.user_id,
                    user_name=user_name_map.get(item.user_id),
                    run_id=item.run_id,
                    thread_id=item.thread_id,
                    thread_name=thread_name_map.get(item.thread_id),
                    agent_id=item.agent_id,
                    rating=RatingValue(item.rating),
                    comment=item.comment,
                    question=question,
                    answer=answer,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
            )

        return RatingAdminListResponse(
            items=typed_items,
            page=params.page,
            page_size=params.page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    @staticmethod
    async def _fetch_histories_for_items(items: list[AnswerRating]) -> dict[tuple[str, str], list[dict]]:
        unique_keys = {(item.thread_id, item.user_id) for item in items if item.thread_id and item.user_id}
        if not unique_keys:
            return {}

        timeout = httpx.Timeout(4.0, connect=1.5)
        history_endpoint = f"{settings.agent_service_url.rstrip('/')}/history"

        async with httpx.AsyncClient(timeout=timeout) as client:
            async def fetch_one(key: tuple[str, str]) -> tuple[tuple[str, str], list[dict]]:
                thread_id, user_id = key
                try:
                    response = await client.post(
                        history_endpoint,
                        json={"thread_id": thread_id},
                        headers={"X-User-Id": user_id},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    messages = payload.get("messages", []) if isinstance(payload, dict) else []
                    if isinstance(messages, list):
                        return key, messages
                except Exception:
                    logger.warning("Cannot load history for thread=%s user=%s", thread_id, user_id, exc_info=True)
                return key, []

            pairs = await asyncio.gather(*(fetch_one(key) for key in unique_keys))

        return {key: messages for key, messages in pairs}

    @staticmethod
    def _extract_question_answer(messages: list[dict], run_id: str) -> tuple[str, str]:
        missing_question = "Không tìm thấy nội dung câu hỏi của người dùng"
        missing_answer = "Không tìm thấy nội dung câu trả lời từ chatbot"

        if not messages:
            return missing_question, missing_answer

        # Find all AI messages matching the run_id
        matching_ai_indices = [
            index
            for index, msg in enumerate(messages)
            if msg.get("type") == "ai" and str(msg.get("run_id") or "") == run_id
        ]

        if matching_ai_indices:
            # Prefer the one with non-empty content, or fallback to the last matching AI message
            ai_index = next(
                (idx for idx in matching_ai_indices if messages[idx].get("content")),
                matching_ai_indices[-1]
            )
            ai_message = messages[ai_index]
            question_message = next(
                (msg for msg in reversed(messages[:ai_index]) if msg.get("type") == "human"),
                None,
            )
            question = str(question_message.get("content") or missing_question) if question_message else missing_question
            answer = str(ai_message.get("content") or missing_answer)
            return question, answer

        last_ai_index = next((index for index in range(len(messages) - 1, -1, -1) if messages[index].get("type") == "ai"), None)
        if last_ai_index is None:
            return missing_question, missing_answer

        last_ai = messages[last_ai_index]
        question_message = next(
            (msg for msg in reversed(messages[:last_ai_index]) if msg.get("type") == "human"),
            None,
        )
        question = str(question_message.get("content") or missing_question) if question_message else missing_question
        answer = str(last_ai.get("content") or missing_answer)
        return question, answer

    @staticmethod
    async def get_admin_stats(
        db: AsyncSession,
        *,
        search: Optional[str] = None,
        rating: Optional[RatingValue] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> RatingAdminStatsResponse:
        """Calculate and return admin rating statistics and daily trend."""
        total, like_count, dislike_count, daily_raw, reasons_count = await RatingRepository.get_admin_stats(
            db,
            search=search,
            rating=rating,
            from_date=from_date,
            to_date=to_date,
        )

        like_percentage: float = (like_count / total * 100.0) if total > 0 else 0.0

        daily_stats = []
        for d, likes, dislikes in daily_raw:
            if isinstance(d, (datetime, date)):
                d_str = d.strftime("%Y-%m-%d")
            else:
                d_str = str(d)
            daily_stats.append(
                DailyRatingStat(
                    date=d_str,
                    like_count=likes,
                    dislike_count=dislikes,
                )
            )

        dislike_reasons = [
            DislikeReasonStat(reason=reason, count=count)
            for reason, count in reasons_count.items()
        ]

        return RatingAdminStatsResponse(
            total=total,
            like_count=like_count,
            dislike_count=dislike_count,
            like_percentage=round(like_percentage, 2),
            daily_stats=daily_stats,
            dislike_reasons=dislike_reasons,
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