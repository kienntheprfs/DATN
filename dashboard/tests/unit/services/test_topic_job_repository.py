"""Tests for topic job repository."""

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.topic_pipeline import DashboardTopicPipelineJob, JobStatus
from src.repositories.topic_job_repository import JobConflictError, TopicJobRepository


@pytest_asyncio.fixture(autouse=True)
async def clean_topic_jobs(test_db_session: AsyncSession):
    await test_db_session.execute(delete(DashboardTopicPipelineJob))
    await test_db_session.commit()
    yield
    await test_db_session.execute(delete(DashboardTopicPipelineJob))
    await test_db_session.commit()


@pytest.mark.asyncio
async def test_create_job_if_no_active_succeeds_when_no_active_job(
    test_db_session: AsyncSession,
) -> None:
    job, created = await TopicJobRepository.create_job_if_no_active(
        test_db_session,
        topic_type="missing_knowledge",
        time_range="7d",
    )
    assert created is True
    assert job.topic_type == "missing_knowledge"
    assert job.time_range == "7d"
    assert job.status == JobStatus.PENDING.value


@pytest.mark.asyncio
async def test_create_job_if_no_active_raises_conflict_when_active_exists(
    test_db_session: AsyncSession,
) -> None:
    existing, _ = await TopicJobRepository.create_job_if_no_active(
        test_db_session,
        topic_type="missing_knowledge",
        time_range="7d",
    )
    await test_db_session.commit()

    with pytest.raises(JobConflictError) as exc_info:
        await TopicJobRepository.create_job_if_no_active(
            test_db_session,
            topic_type="missing_knowledge",
            time_range="14d",
        )
    assert exc_info.value.job_id == existing.id


@pytest.mark.asyncio
async def test_get_active_job_returns_pending_job(test_db_session: AsyncSession) -> None:
    job, _ = await TopicJobRepository.create_job_if_no_active(
        test_db_session,
        topic_type="missing_knowledge",
        time_range="7d",
    )
    await test_db_session.commit()

    active = await TopicJobRepository.get_active_job(test_db_session)
    assert active is not None
    assert active.id == job.id


@pytest.mark.asyncio
async def test_get_latest_returns_most_recent(test_db_session: AsyncSession) -> None:
    job1, _ = await TopicJobRepository.create_job_if_no_active(
        test_db_session,
        topic_type="missing_knowledge",
        time_range="7d",
    )
    await TopicJobRepository.mark_succeeded(test_db_session, job1)
    await test_db_session.commit()

    job2, _ = await TopicJobRepository.create_job_if_no_active(
        test_db_session,
        topic_type="popular_questions",
        time_range="14d",
    )
    await test_db_session.commit()

    latest = await TopicJobRepository.get_latest(test_db_session)
    assert latest is not None
    assert latest.id == job2.id
