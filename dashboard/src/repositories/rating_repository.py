"""Repository methods for answer ratings."""

from datetime import date, datetime, time, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import Date, String, asc, case, cast, desc, func, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.models import AnswerRating, RatingValue


class RatingRepository:
    """Encapsulate persistence operations for answer ratings."""

    @staticmethod
    async def get_by_user_run(db: AsyncSession, user_id: str, run_id: str) -> Optional[AnswerRating]:
        """Return one rating by composite key `(user_id, run_id)` if it exists."""
        statement = select(AnswerRating).where(
            AnswerRating.user_id == user_id,
            AnswerRating.run_id == run_id,
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(db: AsyncSession, rating_id: UUID) -> Optional[AnswerRating]:
        """Return one rating by primary key."""
        statement = select(AnswerRating).where(AnswerRating.id == rating_id)
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def create(db: AsyncSession, rating: AnswerRating) -> AnswerRating:
        """Add a new rating to the active session."""
        db.add(rating)
        return rating

    @staticmethod
    async def update(db: AsyncSession, rating: AnswerRating) -> AnswerRating:
        """Add updated rating entity to active session."""
        db.add(rating)
        return rating

    @staticmethod
    async def delete(db: AsyncSession, rating: AnswerRating) -> None:
        """Delete rating entity from session."""
        await db.delete(rating)

    @staticmethod
    async def get_thread_ratings(
        db: AsyncSession,
        thread_id: str,
        user_id: Optional[str] = None,
    ) -> list[AnswerRating]:
        """Return ratings for a thread, optionally restricted to one user."""
        statement = select(AnswerRating).where(AnswerRating.thread_id == thread_id)
        if user_id is not None:
            statement = statement.where(AnswerRating.user_id == user_id)
        result = await db.execute(statement.order_by(desc(AnswerRating.created_at)))
        return list(result.scalars().all())

    @staticmethod
    async def get_agent_stats(db: AsyncSession, agent_id: str) -> tuple[int, int, int]:
        """Return `(total, like_count, dislike_count)` for one agent."""
        like_case = case((AnswerRating.rating == RatingValue.LIKE.value, 1), else_=0)
        dislike_case = case((AnswerRating.rating == RatingValue.DISLIKE.value, 1), else_=0)
        statement = select(
            func.count(AnswerRating.id),
            func.sum(like_case),
            func.sum(dislike_case),
        ).where(AnswerRating.agent_id == agent_id)
        result = await db.execute(statement)
        row = result.one()
        total = int(row[0] or 0)
        like_count = int(row[1] or 0)
        dislike_count = int(row[2] or 0)
        return total, like_count, dislike_count

    @staticmethod
    def _build_admin_filters(
        statement,
        *,
        search: Optional[str] = None,
        rating: Optional[RatingValue] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ):
        if search:
            pattern = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    cast(AnswerRating.run_id, String).ilike(pattern),
                    cast(AnswerRating.thread_id, String).ilike(pattern),
                    cast(AnswerRating.user_id, String).ilike(pattern),
                    cast(AnswerRating.agent_id, String).ilike(pattern),
                    cast(AnswerRating.comment, String).ilike(pattern),
                )
            )

        if rating is not None:
            statement = statement.where(AnswerRating.rating == rating.value)

        if from_date is not None:
            from_dt = datetime.combine(from_date, time.min)
            statement = statement.where(AnswerRating.created_at >= from_dt)

        if to_date is not None:
            end_exclusive = datetime.combine(to_date + timedelta(days=1), time.min)
            statement = statement.where(AnswerRating.created_at < end_exclusive)

        return statement

    @staticmethod
    async def list_admin_ratings(
        db: AsyncSession,
        *,
        page: int,
        page_size: int,
        search: Optional[str] = None,
        rating: Optional[RatingValue] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        sort_by: str = "created_desc",
    ) -> tuple[list[AnswerRating], int]:
        """Return paginated ratings for admin table with optional filters."""
        base = select(AnswerRating)
        filtered = RatingRepository._build_admin_filters(
            base,
            search=search,
            rating=rating,
            from_date=from_date,
            to_date=to_date,
        )

        count_statement = select(func.count(AnswerRating.id))
        count_statement = RatingRepository._build_admin_filters(
            count_statement,
            search=search,
            rating=rating,
            from_date=from_date,
            to_date=to_date,
        )
        count_result = await db.execute(count_statement)
        total_items = int(count_result.scalar_one() or 0)

        offset = (page - 1) * page_size
        if sort_by == "created_asc":
            order_clause = [asc(AnswerRating.created_at), asc(AnswerRating.id)]
        elif sort_by == "updated_desc":
            order_clause = [desc(AnswerRating.updated_at), desc(AnswerRating.id)]
        elif sort_by == "updated_asc":
            order_clause = [asc(AnswerRating.updated_at), asc(AnswerRating.id)]
        elif sort_by == "rating_desc":
            order_clause = [desc(AnswerRating.rating), desc(AnswerRating.created_at), desc(AnswerRating.id)]
        elif sort_by == "rating_asc":
            order_clause = [asc(AnswerRating.rating), desc(AnswerRating.created_at), desc(AnswerRating.id)]
        else:
            order_clause = [desc(AnswerRating.created_at), desc(AnswerRating.id)]

        result = await db.execute(
            filtered.order_by(*order_clause).offset(offset).limit(page_size)
        )
        items = list(result.scalars().all())
        return items, total_items

    @staticmethod
    async def get_thread_user_metadata(
        db: AsyncSession,
        *,
        thread_ids: set[str],
        user_ids: set[str],
    ) -> tuple[dict[str, str], dict[str, str]]:
        """Return maps for thread titles and user display names.

        Falls back to empty maps if underlying schemas are unavailable.
        """
        thread_name_map: dict[str, str] = {}
        user_name_map: dict[str, str] = {}

        if thread_ids:
            thread_stmt = text(
                """
                SELECT id, title
                FROM agent_schema.conversations
                WHERE id = ANY(:thread_ids)
                """
            )
            try:
                thread_rows = await db.execute(thread_stmt, {"thread_ids": list(thread_ids)})
                for row in thread_rows:
                    thread_id = str(row[0])
                    title = row[1]
                    if title:
                        thread_name_map[thread_id] = str(title)
            except Exception:
                # Keep admin list endpoint resilient even if api_gateway schema is not present.
                thread_name_map = {}

        if user_ids:
            user_stmt = text(
                """
                SELECT id, display_name, email
                FROM api_gateway.users
                WHERE id = ANY(:user_ids)
                """
            )
            try:
                user_rows = await db.execute(user_stmt, {"user_ids": list(user_ids)})
                for row in user_rows:
                    user_id = str(row[0])
                    display_name = row[1]
                    email = row[2]
                    if display_name:
                        user_name_map[user_id] = str(display_name)
                    elif email:
                        user_name_map[user_id] = str(email)
            except Exception:
                user_name_map = {}

        return thread_name_map, user_name_map

    @staticmethod
    async def get_admin_stats(
        db: AsyncSession,
        *,
        search: Optional[str] = None,
        rating: Optional[RatingValue] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> tuple[int, int, int, list[tuple[date, int, int]], dict[str, int]]:
        """Return aggregate stats, daily trend, and dislike reasons for admin dashboard."""
        like_case = case((AnswerRating.rating == RatingValue.LIKE.value, 1), else_=0)
        dislike_case = case((AnswerRating.rating == RatingValue.DISLIKE.value, 1), else_=0)

        totals_statement = select(
            func.count(AnswerRating.id),
            func.sum(like_case),
            func.sum(dislike_case),
        )
        totals_statement = RatingRepository._build_admin_filters(
            totals_statement,
            search=search,
            rating=rating,
            from_date=from_date,
            to_date=to_date,
        )
        totals_result = await db.execute(totals_statement)
        totals_row = totals_result.one()
        total = int(totals_row[0] or 0)
        like_count = int(totals_row[1] or 0)
        dislike_count = int(totals_row[2] or 0)

        date_expr = func.date(AnswerRating.created_at)
        daily_statement = (
            select(
                date_expr,
                func.sum(like_case),
                func.sum(dislike_case),
            )
            .group_by(date_expr)
            .order_by(date_expr)
        )
        daily_statement = RatingRepository._build_admin_filters(
            daily_statement,
            search=search,
            rating=rating,
            from_date=from_date,
            to_date=to_date,
        )

        daily_result = await db.execute(daily_statement)
        daily_rows = daily_result.all()

        daily_stats = []
        for row in daily_rows:
            d = row[0]
            likes = int(row[1] or 0)
            dislikes = int(row[2] or 0)
            daily_stats.append((d, likes, dislikes))

        # Count dislike reasons from dislike rating comments
        reasons_list = [
            "Thông tin sai",
            "Không rõ ràng",
            "Chưa đầy đủ",
            "Quá dài",
            "Không liên quan",
            "Khác"
        ]
        reasons_count = {reason: 0 for reason in reasons_list}
        
        if dislike_count > 0:
            dislike_query = select(AnswerRating.comment).where(
                AnswerRating.rating == RatingValue.DISLIKE.value
            )
            dislike_query = RatingRepository._build_admin_filters(
                dislike_query,
                search=search,
                from_date=from_date,
                to_date=to_date,
            )
            dislike_result = await db.execute(dislike_query)
            dislike_comments = [row[0] for row in dislike_result.all() if row[0]]

            for comment in dislike_comments:
                matched = False
                for reason in reasons_list:
                    if reason in comment:
                        reasons_count[reason] += 1
                        matched = True
                if not matched:
                    reasons_count["Khác"] += 1

        return total, like_count, dislike_count, daily_stats, reasons_count