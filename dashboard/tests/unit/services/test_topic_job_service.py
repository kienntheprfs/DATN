"""Tests for topic job service."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.models.topic_pipeline import TimeRange, TopicType
from src.services.topic_job_service import TopicJobService


class _FakeBackgroundTasks:
    def __init__(self) -> None:
        self.calls = []

    def add_task(self, fn, *args):
        self.calls.append((fn, args))


class _FakeSession:
    async def commit(self):
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
