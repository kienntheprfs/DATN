"""Topic job service - orchestration layer for topic pipeline."""

import logging
from typing import Callable, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.models.topic_pipeline import (
    DashboardTopicPipelineJob,
    JobStage,
    TimeRange,
    TopicType,
)
from src.pipeline.inputs.registry import get_input_adapter
from src.pipeline.orchestrator import PipelineOrchestrator
from src.pipeline.outputs.registry import get_output_adapters
from src.repositories.topic_job_repository import JobConflictError, TopicJobRepository
from src.services.topic_engine import FastTopicEngine
from src.services.timezone_utils import parse_time_range

logger: logging.Logger = logging.getLogger(__name__)


async def _run_background_job(
    job_id: UUID,
    time_range: TimeRange,
    db_session_factory: Callable[[], AsyncSession],
) -> None:
    """Background task that executes the full topic modeling pipeline.

    A single job runs BOTH input sources and creates one DashboardTopicResult
    per TopicType.
    """
    async with db_session_factory() as db:
        job: Optional[DashboardTopicPipelineJob] = await TopicJobRepository.get_by_id(
            db, job_id
        )
        if job is None:
            logger.warning("job %s not found, aborting", job_id)
            return

        try:
            await TopicJobRepository.mark_running(db, job)
            await db.commit()

            from_ts, to_ts = parse_time_range(time_range)

            # Build all input adapters
            input_adapters = {
                TopicType.MISSING_KNOWLEDGE: get_input_adapter(TopicType.MISSING_KNOWLEDGE),
                TopicType.POPULAR_QUESTIONS: get_input_adapter(TopicType.POPULAR_QUESTIONS),
            }

            engine = FastTopicEngine(
                embedding_model_name=settings.topic_embedding_model,
                cluster_algorithm=settings.topic_cluster_algorithm,
                tokenizer_backend=settings.topic_tokenizer_backend,
            )
            csv_exporter, db_exporter = get_output_adapters(settings.topic_output_dir)

            async def on_progress(stage: JobStage, progress: int, message: str) -> None:
                await TopicJobRepository.update_job_progress(
                    db,
                    job,
                    stage,
                    progress,
                    message,
                )
                await db.commit()

            orchestrator = PipelineOrchestrator(on_progress=on_progress)
            await orchestrator.run(
                db=db,
                job_id=job.id,
                time_range=time_range,
                from_ts=from_ts,
                to_ts=to_ts,
                input_adapters=input_adapters,
                modeling_engine=engine,
                csv_exporter=csv_exporter,
                db_exporter=db_exporter,
            )

            await db.commit()

            await TopicJobRepository.mark_succeeded(db, job)
            await db.commit()
            logger.info("job %s completed successfully", job_id)

        except Exception as exc:
            logger.exception("job %s failed", job_id)
            try:
                await db.rollback()
                await TopicJobRepository.mark_failed(db, job, str(exc)[:2000])
                await db.commit()
            except Exception:
                logger.exception("failed to mark job %s as failed", job_id)


class TopicJobService:
    """High-level service for triggering and managing topic pipeline jobs."""

    @staticmethod
    async def trigger_job(
        db: AsyncSession,
        time_range: TimeRange,
        background_tasks,  # BackgroundTasks from fastapi
        db_session_factory: Callable[[], AsyncSession],
    ) -> tuple[DashboardTopicPipelineJob, bool]:
        """Attempt to create and enqueue a new job.

        Returns (job, created).
        Raises JobConflictError if an active job already exists.
        """
        job, created = await TopicJobRepository.create_job_if_no_active(
            db,
            time_range=time_range.value,
        )
        await db.commit()
        await db.refresh(job)

        if created:
            background_tasks.add_task(
                _run_background_job,
                job.id,
                time_range,
                db_session_factory,
            )
            logger.info("job %s enqueued", job.id)

        return job, created

    @staticmethod
    async def get_current_job(db: AsyncSession) -> Optional[DashboardTopicPipelineJob]:
        """Return the currently active job or the most recent one."""
        return await TopicJobRepository.get_current_job(db)

    @staticmethod
    async def get_job_by_id(
        db: AsyncSession, job_id: UUID
    ) -> Optional[DashboardTopicPipelineJob]:
        """Return job by ID."""
        return await TopicJobRepository.get_by_id(db, job_id)
