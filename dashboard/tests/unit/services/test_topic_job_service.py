"""Tests for topic job service."""

from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import MagicMock, AsyncMock

import pytest

from src.models.topic_pipeline import TimeRange, TopicType
from src.services.topic_job_service import TopicJobService


class _FakeBackgroundTasks:
    def __init__(self) -> None:
        self.calls = []

    def add_task(self, fn, *args):
        self.calls.append((fn, args))


class _FakeSession:
    async def __aenter__(self):
        return self
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
    async def commit(self):
        return None
    async def rollback(self):
        return None
    async def refresh(self, obj):
        return None


@pytest.mark.asyncio
async def test_trigger_job_enqueues_background_task(monkeypatch) -> None:
    fake_job = SimpleNamespace(
        id=uuid4(),
        time_range=TimeRange.DAYS_7.value,
        status="pending",
        stage="pending",
        progress=0,
        message=None,
        created_at=None,
        updated_at=None,
    )

    async def fake_create_job_if_no_active(db, time_range):
        return fake_job, True

    from src.repositories import topic_job_repository

    monkeypatch.setattr(
        topic_job_repository.TopicJobRepository,
        "create_job_if_no_active",
        staticmethod(fake_create_job_if_no_active),
    )

    background_tasks = _FakeBackgroundTasks()
    job, created = await TopicJobService.trigger_job(
        db=_FakeSession(),
        time_range=TimeRange.DAYS_7,
        background_tasks=background_tasks,
        db_session_factory=lambda: _FakeSession(),
    )

    assert created is True
    assert job.id == fake_job.id
    assert len(background_tasks.calls) == 1

@pytest.mark.asyncio
async def test_run_background_job_success(monkeypatch) -> None:
    from src.services.topic_job_service import _run_background_job
    from src.models.topic_pipeline import DashboardTopicPipelineJob, JobStatus
    
    job_id = uuid4()
    job = DashboardTopicPipelineJob(id=job_id, status=JobStatus.PENDING.value, time_range="7d")
    
    # Mocks
    mock_repo = MagicMock()
    mock_repo.get_by_id = AsyncMock(return_value=job)
    mock_repo.mark_running = AsyncMock()
    mock_repo.mark_succeeded = AsyncMock()
    
    monkeypatch.setattr("src.services.topic_job_service.TopicJobRepository", mock_repo)
    monkeypatch.setattr("src.services.topic_job_service.parse_time_range", MagicMock(return_value=(None, None)))
    
    mock_orchestrator = MagicMock()
    mock_orchestrator.return_value.run = AsyncMock()
    monkeypatch.setattr("src.services.topic_job_service.PipelineOrchestrator", mock_orchestrator)
    
    # Mock exporters and adapters
    monkeypatch.setattr("src.services.topic_job_service.get_input_adapter", MagicMock())
    monkeypatch.setattr("src.services.topic_job_service.get_output_adapters", MagicMock(return_value=(MagicMock(), MagicMock())))
    
    async def _run():
        await _run_background_job(job_id, TimeRange.DAYS_7, lambda: _FakeSession())
        
    await _run()
    
    mock_repo.mark_running.assert_called_once()
    mock_repo.mark_succeeded.assert_called_once()

@pytest.mark.asyncio
async def test_run_background_job_failure(monkeypatch) -> None:
    from src.services.topic_job_service import _run_background_job
    
    job_id = uuid4()
    job = MagicMock()
    
    mock_repo = MagicMock()
    mock_repo.get_by_id = AsyncMock(return_value=job)
    mock_repo.mark_running = AsyncMock(side_effect=Exception("Crash"))
    mock_repo.mark_failed = AsyncMock()
    
    monkeypatch.setattr("src.services.topic_job_service.TopicJobRepository", mock_repo)
    
    await _run_background_job(job_id, TimeRange.DAYS_7, lambda: _FakeSession())
    
    mock_repo.mark_failed.assert_called_once()
