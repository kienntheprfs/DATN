"""Tests for TopicJobRepository."""

import pytest
from src.models.topic_pipeline import DashboardTopicPipelineJob, JobStatus, JobStage
from src.repositories.topic_job_repository import TopicJobRepository, JobConflictError
from sqlalchemy import delete

@pytest.fixture(autouse=True)
async def cleanup(test_db_session):
    await test_db_session.execute(delete(DashboardTopicPipelineJob))
    await test_db_session.commit()

@pytest.mark.asyncio
async def test_topic_job_repository_flow(test_db_session):
    # 1. Create job
    job, created = await TopicJobRepository.create_job_if_no_active(test_db_session, "7d")
    assert created is True
    assert job.status == JobStatus.PENDING.value
    await test_db_session.commit()
    
    # 2. Prevent duplicate active job
    with pytest.raises(JobConflictError):
        await TopicJobRepository.create_job_if_no_active(test_db_session, "24h")
        
    # 3. Mark running
    await TopicJobRepository.mark_running(test_db_session, job)
    assert job.status == JobStatus.RUNNING.value
    await test_db_session.commit()
    
    # 4. Update progress
    await TopicJobRepository.update_job_progress(test_db_session, job, JobStage.MODELING, 50, "Working...")
    assert job.progress == 50
    assert job.message == "Working..."
    await test_db_session.commit()
    
    # 5. Get current job
    current = await TopicJobRepository.get_current_job(test_db_session)
    assert current.id == job.id
    
    # 6. Mark succeeded
    await TopicJobRepository.mark_succeeded(test_db_session, job)
    assert job.status == JobStatus.SUCCEEDED.value
    assert job.progress == 100
    await test_db_session.commit()
    
    # 7. Now we can create a new job
    job2, created2 = await TopicJobRepository.create_job_if_no_active(test_db_session, "24h")
    assert created2 is True
    await test_db_session.commit()
    
    # 8. Mark failed
    await TopicJobRepository.mark_failed(test_db_session, job2, "Something went wrong")
    assert job2.status == JobStatus.FAILED.value
    assert job2.error_detail == "Something went wrong"

@pytest.mark.asyncio
async def test_topic_job_repository_get_by_id(test_db_session):
    job, _ = await TopicJobRepository.create_job_if_no_active(test_db_session, "7d")
    await test_db_session.commit()
    
    fetched = await TopicJobRepository.get_by_id(test_db_session, job.id)
    assert fetched.id == job.id
    
    from uuid import uuid4
    not_found = await TopicJobRepository.get_by_id(test_db_session, uuid4())
    assert not_found is None
