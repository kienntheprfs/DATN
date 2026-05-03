"""Pipeline orchestrator for topic modeling."""

import logging
from datetime import datetime
from typing import Any, Awaitable, Callable
from uuid import UUID

from src.models.topic_pipeline import JobStage, TimeRange, TopicType
from src.pipeline.inputs.base import InputAdapter
from src.pipeline.outputs.csv_exporter import CSVExporter
from src.pipeline.outputs.db_exporter import DBExporter
from src.services.topic_engine import FastTopicEngine

try:
    from sqlalchemy.ext.asyncio import AsyncSession
except Exception:  # pragma: no cover - type-only guard
    AsyncSession = Any

logger: logging.Logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    """Orchestrate topic modeling pipeline stages.

    A single job runs BOTH input sources (missing_knowledge + popular_questions)
    and produces two DashboardTopicResult rows so the frontend can query each
    topic type independently.
    """

    def __init__(
        self,
        on_progress: (
            Callable[[JobStage, int, str], Awaitable[None] | None] | None
        ) = None,
    ) -> None:
        self._on_progress = on_progress

    async def _report(self, stage: JobStage, progress: int, message: str) -> None:
        if self._on_progress is None:
            return
        result = self._on_progress(stage, progress, message)
        if hasattr(result, "__await__"):
            await result

    async def _run_single_source(
        self,
        db: AsyncSession,
        job_id: UUID,
        topic_type: TopicType,
        time_range: TimeRange,
        from_ts: datetime,
        to_ts: datetime,
        input_adapter: InputAdapter,
        modeling_engine: FastTopicEngine,
        csv_exporter: CSVExporter,
        db_exporter: DBExporter,
        base_progress: int,
    ) -> dict[str, Any] | None:
        """Run pipeline for a single input source, returning result info or None."""
        label = topic_type.value.replace("_", " ").title()
        await self._report(
            JobStage.LOADING_INPUT,
            base_progress,
            f"Loading {label} data...",
        )

        try:
            raw_pairs: list[tuple[str, datetime | None]] = await input_adapter.fetch(
                db, from_ts, to_ts
            )
        except Exception as exc:
            logger.warning("Input adapter %s failed: %s", topic_type.value, exc)
            return None

        if not raw_pairs:
            logger.info("No documents for %s, skipping.", topic_type.value)
            return None

        documents: list[str] = [doc for doc, _ in raw_pairs]
        doc_timestamps: list[datetime | None] = [ts for _, ts in raw_pairs]

        await self._report(
            JobStage.MODELING,
            base_progress + 10,
            f"{label}: modeling {len(documents)} documents...",
        )

        topics, topic_words, topic_sentiment = await modeling_engine.fit_predict(documents)
        topic_labels: dict[int, str] = {}
        if hasattr(modeling_engine, "generate_labels"):
            topic_labels = await modeling_engine.generate_labels(documents, topics, topic_words)

        await self._report(
            JobStage.EXPORTING_FILE,
            base_progress + 20,
            f"{label}: exporting CSV...",
        )
        await csv_exporter.export(
            job_id=job_id,
            topic_type=topic_type,
            time_range=time_range,
            documents=documents,
            topics=topics,
            topic_words=topic_words,
            topic_labels=topic_labels,
            topic_sentiment=topic_sentiment,
        )

        await self._report(
            JobStage.EXPORTING_DB,
            base_progress + 25,
            f"{label}: saving to database...",
        )
        result = await db_exporter.export(
            db=db,
            job_id=job_id,
            topic_type=topic_type,
            time_range=time_range,
            documents=documents,
            doc_timestamps=doc_timestamps,
            topics=topics,
            topic_words=topic_words,
            topic_labels=topic_labels,
            topic_sentiment=topic_sentiment,
        )

        return {
            "topic_type": topic_type.value,
            "n_topics": len(set(topics)),
            "n_documents": len(documents),
            "result_id": str(result.id),
        }

    async def run(
        self,
        db: AsyncSession,
        job_id: UUID,
        time_range: TimeRange,
        from_ts: datetime,
        to_ts: datetime,
        input_adapters: dict[TopicType, InputAdapter],
        modeling_engine: FastTopicEngine,
        csv_exporter: CSVExporter,
        db_exporter: DBExporter,
    ) -> dict[str, Any]:
        """Execute full pipeline for all configured input sources."""
        results: list[dict] = []
        total_sources = len(input_adapters)
        progress_per_source = 90 // max(total_sources, 1)

        for idx, (topic_type, adapter) in enumerate(input_adapters.items()):
            base_progress = 5 + idx * progress_per_source
            single_result = await self._run_single_source(
                db=db,
                job_id=job_id,
                topic_type=topic_type,
                time_range=time_range,
                from_ts=from_ts,
                to_ts=to_ts,
                input_adapter=adapter,
                modeling_engine=modeling_engine,
                csv_exporter=csv_exporter,
                db_exporter=db_exporter,
                base_progress=base_progress,
            )
            if single_result:
                results.append(single_result)

        await self._report(JobStage.COMPLETED, 100, "pipeline completed")
        return {
            "status": "success" if results else "skipped",
            "results": results,
        }
