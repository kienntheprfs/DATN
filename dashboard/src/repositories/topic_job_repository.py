"""Repository methods for topic pipeline jobs."""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.topic_pipeline import DashboardTopicPipelineJob, JobStage, JobStatus

# Jobs that have not received a progress update in this many minutes are
# considered stale/zombie and will be auto-failed before a new job is created.
STALE_JOB_TIMEOUT_MINUTES: int = 30


class JobConflictError(Exception):
    """Raised when an active job already exists and a new one cannot be created."""

    def __init__(self, job_id: UUID, status: str, stage: str) -> None:
        self.job_id = job_id
        self.status = status
        self.stage = stage
        super().__init__(
            f"active job {job_id} exists with status={status}, stage={stage}"
        )


class TopicJobRepository:
    """Encapsulate persistence operations for topic pipeline jobs."""

    @staticmethod
    async def get_active_job(db: AsyncSession) -> Optional[DashboardTopicPipelineJob]:
        """Return the currently active job (pending or running) if any."""
        statement = (
            select(DashboardTopicPipelineJob)
            .where(
                DashboardTopicPipelineJob.status.in_(
                    [JobStatus.PENDING.value, JobStatus.RUNNING.value]
                )
            )
            .order_by(DashboardTopicPipelineJob.created_at.desc())
            .limit(1)
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(
        db: AsyncSession, job_id: UUID
    ) -> Optional[DashboardTopicPipelineJob]:
        """Return job by primary key."""
        statement = select(DashboardTopicPipelineJob).where(
            DashboardTopicPipelineJob.id == job_id
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_latest(db: AsyncSession) -> Optional[DashboardTopicPipelineJob]:
        """Return the most recently created job regardless of status."""
        statement = (
            select(DashboardTopicPipelineJob)
            .order_by(DashboardTopicPipelineJob.created_at.desc())
            .limit(1)
        )
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def cancel_job(
        db: AsyncSession,
        job: DashboardTopicPipelineJob,
        reason: str = "cancelled by user",
    ) -> DashboardTopicPipelineJob:
        """Force-cancel a running/pending job, marking it as FAILED."""
        job.status = JobStatus.FAILED.value
        job.stage = JobStage.COMPLETED.value
        job.error_detail = reason[:2000]
        job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.add(job)
        return job

    @staticmethod
    async def recover_stale_jobs(
        db: AsyncSession,
        timeout_minutes: int = STALE_JOB_TIMEOUT_MINUTES,
    ) -> list[DashboardTopicPipelineJob]:
        """Find active jobs that haven't been updated recently and mark them failed.

        Returns the list of jobs that were auto-recovered.
        """
        cutoff = datetime.utcnow() - timedelta(minutes=timeout_minutes)
        statement = (
            select(DashboardTopicPipelineJob)
            .where(
                and_(
                    DashboardTopicPipelineJob.status.in_(
                        [JobStatus.PENDING.value, JobStatus.RUNNING.value]
                    ),
                    DashboardTopicPipelineJob.updated_at < cutoff,
                )
            )
        )
        result = await db.execute(statement)
        stale_jobs = list(result.scalars().all())
        for job in stale_jobs:
            await TopicJobRepository.cancel_job(
                db,
                job,
                reason=f"auto-recovered: no progress for over {timeout_minutes} minutes",
            )
        return stale_jobs

    @staticmethod
    async def create_job_if_no_active(
        db: AsyncSession,
        time_range: str,
    ) -> tuple[DashboardTopicPipelineJob, bool]:
        """Insert a new pending job only if no active job exists.

        Stale jobs (no progress update for STALE_JOB_TIMEOUT_MINUTES) are
        auto-recovered (marked as failed) before the conflict check so they
        don't permanently block new runs.

        Returns (job, created) where created is True if the job was newly inserted.
        Raises JobConflictError if an active job already exists.
        """
        # Auto-recover zombie jobs before checking for conflicts.
        await TopicJobRepository.recover_stale_jobs(db)

        active = await TopicJobRepository.get_active_job(db)
        if active is not None:
            raise JobConflictError(
                job_id=active.id,
                status=active.status,
                stage=active.stage,
            )

        job = DashboardTopicPipelineJob(
            time_range=time_range,
            status=JobStatus.PENDING.value,
            stage=JobStage.PENDING.value,
            progress=0,
        )
        db.add(job)

        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            if "uq_dashboard_topic_pipeline_jobs_one_active" in str(exc):
                active = await TopicJobRepository.get_active_job(db)
                if active is not None:
                    raise JobConflictError(
                        job_id=active.id,
                        status=active.status,
                        stage=active.stage,
                    ) from exc
                raise JobConflictError(
                    job_id=UUID("00000000-0000-0000-0000-000000000000"),
                    status="active",
                    stage="unknown",
                ) from exc
            raise

        return job, True

    @staticmethod
    async def get_current_job(db: AsyncSession) -> Optional[DashboardTopicPipelineJob]:
        """Return active job when present, otherwise most recent completed/failed job."""
        active = await TopicJobRepository.get_active_job(db)
        if active is not None:
            return active
        return await TopicJobRepository.get_latest(db)

    @staticmethod
    async def update_job_progress(
        db: AsyncSession,
        job: DashboardTopicPipelineJob,
        stage: JobStage,
        progress: int,
        message: Optional[str] = None,
    ) -> DashboardTopicPipelineJob:
        """Update job stage, progress, and optional message."""
        job.stage = stage.value
        job.progress = progress
        job.message = message
        job.updated_at = datetime.utcnow()
        db.add(job)
        return job

    # Backward-compatible alias while callers are migrated.
    update_progress = update_job_progress

    @staticmethod
    async def mark_running(
        db: AsyncSession, job: DashboardTopicPipelineJob
    ) -> DashboardTopicPipelineJob:
        """Transition job to RUNNING status."""
        job.status = JobStatus.RUNNING.value
        job.stage = JobStage.LOADING_INPUT.value
        job.progress = 10
        job.updated_at = datetime.utcnow()
        db.add(job)
        return job

    @staticmethod
    async def mark_succeeded(
        db: AsyncSession, job: DashboardTopicPipelineJob
    ) -> DashboardTopicPipelineJob:
        """Transition job to SUCCEEDED status."""
        job.status = JobStatus.SUCCEEDED.value
        job.stage = JobStage.COMPLETED.value
        job.progress = 100
        job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.add(job)
        return job

    @staticmethod
    async def mark_failed(
        db: AsyncSession,
        job: DashboardTopicPipelineJob,
        error_detail: str,
    ) -> DashboardTopicPipelineJob:
        """Transition job to FAILED status with error detail."""
        job.status = JobStatus.FAILED.value
        job.stage = JobStage.COMPLETED.value
        job.error_detail = error_detail[:2000]
        job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.add(job)
        return job

    @staticmethod
    async def delete_job(
        db: AsyncSession,
        job: DashboardTopicPipelineJob,
    ) -> None:
        """Permanently delete a job and all its cascaded results/assignments."""
        await db.delete(job)

    @staticmethod
    async def get_jobs_by_status(
        db: AsyncSession,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[DashboardTopicPipelineJob]:
        """Return a list of jobs filtered by status, ordered by creation time desc."""
        statement = select(DashboardTopicPipelineJob)
        if status:
            statement = statement.where(DashboardTopicPipelineJob.status == status)
        statement = statement.order_by(DashboardTopicPipelineJob.created_at.desc()).limit(limit)
        result = await db.execute(statement)
        return list(result.scalars().all())
