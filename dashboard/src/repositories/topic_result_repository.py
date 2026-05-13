"""Repository methods for topic modeling results."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.topic_pipeline import (
    DashboardTopicAssignment,
    DashboardTopicResult,
)


def _ensure_aware(dt: datetime | None) -> datetime | None:
    """Normalise a datetime to naive UTC for TIMESTAMP WITHOUT TIME ZONE columns.

    - None  → None
    - Naive → returned as-is (assumed UTC)
    - Aware → converted to UTC then stripped of tzinfo
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt  # already naive UTC
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


class TopicResultRepository:
    """Encapsulate persistence operations for topic modeling results."""

    @staticmethod
    async def get_latest_result(
        db: AsyncSession,
        topic_type: str,
    ) -> Optional[DashboardTopicResult]:
        """Return the newest result for given topic type."""
        statement = (
            select(DashboardTopicResult)
            .where(DashboardTopicResult.topic_type == topic_type)
            .order_by(desc(DashboardTopicResult.created_at))
            .limit(1)
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(
        db: AsyncSession, result_id: UUID
    ) -> Optional[DashboardTopicResult]:
        """Return result by primary key."""
        statement = select(DashboardTopicResult).where(
            DashboardTopicResult.id == result_id
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        db: AsyncSession,
        job_id: UUID,
        topic_type: str,
        time_range: str,
        n_topics: int,
        n_documents: int,
        topic_summary: dict[int, str],
        topic_keywords: dict[int, list[dict[str, float | str]]],
        topic_sentiment: dict | None = None,
    ) -> DashboardTopicResult:
        """Insert a new result record."""
        result = DashboardTopicResult(
            job_id=job_id,
            topic_type=topic_type,
            time_range=time_range,
            n_topics=n_topics,
            n_documents=n_documents,
            topic_summary=topic_summary,
            topic_keywords=topic_keywords,
            topic_sentiment=topic_sentiment or {},
            topic_marked={},
        )
        db.add(result)
        return result

    @staticmethod
    async def get_assignments_paginated(
        db: AsyncSession,
        result_id: UUID,
        *,
        page: int = 1,
        page_size: int = 20,
        topic_id: Optional[int] = None,
        sort_by: str = "created_desc",
    ) -> tuple[list[DashboardTopicAssignment], int]:
        """Return paginated assignments for a result with optional topic filter."""
        base = select(DashboardTopicAssignment).where(
            DashboardTopicAssignment.result_id == result_id
        )
        if topic_id is not None:
            base = base.where(DashboardTopicAssignment.topic_id == topic_id)

        count_stmt = select(func.count(DashboardTopicAssignment.id)).where(
            DashboardTopicAssignment.result_id == result_id
        )
        if topic_id is not None:
            count_stmt = count_stmt.where(DashboardTopicAssignment.topic_id == topic_id)
        count_result = await db.execute(count_stmt)
        total_items = int(count_result.scalar_one() or 0)

        # Prefer original_created_at for "created" sorts; fall back to pipeline created_at.
        _orig_ts = func.coalesce(
            DashboardTopicAssignment.original_created_at,
            DashboardTopicAssignment.created_at,
        )
        order_column = desc(_orig_ts)
        if sort_by == "created_asc":
            order_column = _orig_ts
        elif sort_by == "topic_asc":
            order_column = DashboardTopicAssignment.topic_id
        elif sort_by == "topic_desc":
            order_column = desc(DashboardTopicAssignment.topic_id)

        offset = (page - 1) * page_size
        stmt = (
            base.order_by(order_column, DashboardTopicAssignment.id)
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return items, total_items

    @staticmethod
    async def bulk_create_assignments(
        db: AsyncSession,
        result_id: UUID,
        assignments: list[dict],
    ) -> int:
        """Bulk insert question-to-topic assignments.

        Returns the number of records inserted.
        """
        if not assignments:
            return 0

        now = datetime.utcnow()
        records = [
            DashboardTopicAssignment(
                result_id=result_id,
                question=item["question"],
                topic_id=item["topic_id"],
                label=item.get("label"),
                source=item["source"],
                original_created_at=_ensure_aware(item.get("original_created_at")),
                created_at=now,
            )
            for item in assignments
        ]

        db.add_all(records)
        return len(records)

    @staticmethod
    async def get_latest_questions(
        db: AsyncSession,
        topic_type: str,
        *,
        page: int,
        page_size: int,
        topic_id: Optional[int],
        sort_by: str,
    ) -> tuple[list[DashboardTopicAssignment], int, bool]:
        """Return questions from the latest run for topic_type with pagination."""
        latest = await TopicResultRepository.get_latest_result(db, topic_type)
        if latest is None:
            return [], 0, False

        items, total = await TopicResultRepository.get_assignments_paginated(
            db,
            latest.id,
            page=page,
            page_size=page_size,
            topic_id=topic_id,
            sort_by=sort_by,
        )
        return items, total, True

    # ------------------------------------------------------------------
    # Trend data  — uses original_created_at (actual question time) for
    # accurate bucketing, with created_at as fallback.
    # ------------------------------------------------------------------

    @staticmethod
    async def get_topic_trend_by_period(
        db: AsyncSession,
        topic_type: str,
        topic_id: int,
        result_id: UUID | None = None,
        period: str = "day",
        limit: int = 60,
    ) -> list[dict]:
        """
        Return aggregated query counts for a topic bucketed by the real source
        timestamp (original_created_at), falling back to pipeline created_at.

        `period` is one of: "day" | "week" | "month"
        """
        trunc = {"day": "day", "week": "week", "month": "month"}.get(period, "day")
        ts_expr = "COALESCE(a.original_created_at, a.created_at)"
        
        where_clause = "WHERE r.topic_type = :topic_type AND a.topic_id = :topic_id"
        params = {"trunc": trunc, "topic_type": topic_type, "topic_id": topic_id, "limit": limit}
        
        if result_id:
            where_clause += " AND r.id = :result_id"
            params["result_id"] = result_id

        stmt = text(
            f"""
            SELECT
                date_trunc(:trunc, {ts_expr}) AS period,
                COUNT(a.id)                   AS count
            FROM dashboard.dashboard_topic_assignments a
            JOIN dashboard.dashboard_topic_results r ON r.id = a.result_id
            {where_clause}
            GROUP BY period
            ORDER BY period DESC
            LIMIT :limit
            """
        )
        rows = await db.execute(stmt, params)
        # Format and reverse to show chronological order (Past -> Present)
        results = [
            {
                "period": row.period.strftime("%Y-%m-%d") if hasattr(row.period, "strftime") else str(row.period),
                "count": int(row.count)
            }
            for row in rows
        ]
        results.reverse()
        return results

    @staticmethod
    async def get_topic_count_by_result(
        db: AsyncSession,
        result_id: UUID,
        topic_id: int,
    ) -> int:
        """Return total document count for a topic in a specific result."""
        stmt = select(func.count(DashboardTopicAssignment.id)).where(
            DashboardTopicAssignment.result_id == result_id,
            DashboardTopicAssignment.topic_id == topic_id,
        )
        result = await db.execute(stmt)
        return int(result.scalar_one() or 0)

    # ------------------------------------------------------------------
    # Source distribution
    # ------------------------------------------------------------------

    @staticmethod
    async def get_source_distribution(
        db: AsyncSession,
        result_id: UUID,
        topic_id: int,
    ) -> list[dict]:
        """Return per-source document counts for a topic."""
        stmt = (
            select(
                DashboardTopicAssignment.source,
                func.count(DashboardTopicAssignment.id).label("count"),
            )
            .where(
                DashboardTopicAssignment.result_id == result_id,
                DashboardTopicAssignment.topic_id == topic_id,
            )
            .group_by(DashboardTopicAssignment.source)
            .order_by(desc("count"))
        )
        rows = await db.execute(stmt)
        return [{"source": row.source, "count": int(row.count)} for row in rows]

    @staticmethod
    async def get_all_source_distributions(
        db: AsyncSession,
        result_id: UUID,
    ) -> dict[int, list[dict]]:
        """Return per-source document counts for all topics in a result."""
        stmt = (
            select(
                DashboardTopicAssignment.topic_id,
                DashboardTopicAssignment.source,
                func.count(DashboardTopicAssignment.id).label("count"),
            )
            .where(DashboardTopicAssignment.result_id == result_id)
            .group_by(DashboardTopicAssignment.topic_id, DashboardTopicAssignment.source)
        )
        rows = await db.execute(stmt)

        dist: dict[int, list[dict]] = {}
        for row in rows:
            if row.topic_id not in dist:
                dist[row.topic_id] = []
            dist[row.topic_id].append({"source": row.source, "count": int(row.count)})

        # Sort each list by count desc
        for t_id in dist:
            dist[t_id].sort(key=lambda x: x["count"], reverse=True)

        return dist

    # ------------------------------------------------------------------
    # Pin state (stored as JSON on DashboardTopicResult.topic_marked)
    # ------------------------------------------------------------------

    @staticmethod
    async def get_pin_state(
        result: DashboardTopicResult,
        topic_id: int,
    ) -> dict:
        """Return the pin state for a (result, topic) pair from the JSON column."""
        key = str(topic_id)
        default = {"pinned": False, "knowledge_updated": False}
        return (result.topic_marked or {}).get(key, default)

    @staticmethod
    async def get_all_pin_states(
        result: DashboardTopicResult,
    ) -> dict[int, dict]:
        """Return all pin states as {topic_id: {pinned, knowledge_updated}}."""
        pins = result.topic_marked or {}
        return {int(k): v for k, v in pins.items()}

    @staticmethod
    async def upsert_pin(
        db: AsyncSession,
        result_id: UUID,
        topic_id: int,
        *,
        pinned: Optional[bool] = None,
        knowledge_updated: Optional[bool] = None,
    ) -> dict:
        """Upsert pin/knowledge state in the topic_marked JSON column.

        Returns the updated pin state dict for the topic.
        """
        result = await TopicResultRepository.get_by_id(db, result_id)
        if result is None:
            raise ValueError(f"Result {result_id} not found")

        key = str(topic_id)
        pins = dict(result.topic_marked or {})
        current = pins.get(key, {"pinned": False, "knowledge_updated": False})

        if pinned is not None:
            current["pinned"] = pinned
        if knowledge_updated is not None:
            current["knowledge_updated"] = knowledge_updated

        pins[key] = current
        result.topic_marked = pins
        # Force SQLAlchemy to detect change on JSON column
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(result, "topic_marked")
        db.add(result)

        return current
