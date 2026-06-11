"""Database output adapter for topic pipeline results."""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.topic_pipeline import TimeRange, TopicType
from src.repositories.topic_result_repository import TopicResultRepository

logger: logging.Logger = logging.getLogger(__name__)


class DBExporter:
    """Export topic modeling results to database (dashboard schema)."""

    async def export(
        self,
        db: AsyncSession,
        job_id: Any,
        topic_type: TopicType,
        time_range: TimeRange,
        documents: list[str],
        topics: list[int],
        topic_words: dict[int, list[tuple[str, float]]],
        topic_labels: dict[int, str] | None = None,
        topic_sentiment: dict[int, dict[str, float]] | None = None,
        doc_timestamps: list[datetime | None] | None = None,
    ) -> Any:
        """Save results, topic summary, and assignments to dashboard schema."""
        if topic_labels is None:
            topic_labels = {}
        if topic_sentiment is None:
            topic_sentiment = {}
        if doc_timestamps is None:
            doc_timestamps = [None] * len(documents)

        n_topics = len(set(topics) - {-1})
        topic_summary: dict[int, str] = {
            topic_id: topic_labels.get(topic_id, "") for topic_id in set(topics) if topic_id != -1
        }
        topic_keywords: dict[int, list[dict[str, float | str]]] = {
            int(topic_id): [
                {"term": str(term), "score": float(score)}
                for term, score in words
            ]
            for topic_id, words in topic_words.items() if topic_id != -1
        }
        # Serialise keys as strings for JSON storage compatibility
        sentiment_serialised: dict[str, dict[str, float]] = {
            str(k): v for k, v in topic_sentiment.items() if k != -1
        }

        result = await TopicResultRepository.create(
            db,
            job_id=job_id,
            topic_type=topic_type.value,
            time_range=time_range.value,
            n_topics=n_topics,
            n_documents=len([t for t in topics if t != -1]),
            topic_summary=topic_summary,
            topic_keywords=topic_keywords,
            topic_sentiment=sentiment_serialised,
        )
        await db.flush()

        assignments = [
            {
                "question": doc,
                "topic_id": topic_id,
                "label": topic_labels.get(topic_id),
                "source": topic_type.value,
                "original_created_at": ts,
            }
            for doc, topic_id, ts in zip(documents, topics, doc_timestamps)
            if topic_id != -1
        ]
        await TopicResultRepository.bulk_create_assignments(db, result.id, assignments)

        logger.info(
            "DB export done: result_id=%s, %d assignments", result.id, len(assignments)
        )
        return result
