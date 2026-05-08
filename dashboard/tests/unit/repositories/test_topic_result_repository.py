"""Tests for TopicResultRepository."""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from src.models.topic_pipeline import DashboardTopicResult, DashboardTopicAssignment
from src.repositories.topic_result_repository import TopicResultRepository, _ensure_aware
from sqlalchemy import delete

@pytest.fixture(autouse=True)
async def cleanup(test_db_session):
    await test_db_session.execute(delete(DashboardTopicAssignment))
    await test_db_session.execute(delete(DashboardTopicResult))
    await test_db_session.commit()

def test_ensure_aware():
    # Naive
    dt = datetime(2024, 1, 1)
    assert _ensure_aware(dt) == dt
    
    # Aware
    dt_aware = datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert _ensure_aware(dt_aware) == dt
    
    # None
    assert _ensure_aware(None) is None

@pytest.mark.asyncio
async def test_topic_result_repository_crud(test_db_session):
    job_id = uuid4()
    topic_type = "missing_knowledge"
    
    # 1. Create
    result = await TopicResultRepository.create(
        test_db_session,
        job_id=job_id,
        topic_type=topic_type,
        time_range="7d",
        n_topics=2,
        n_documents=10,
        topic_summary={0: "Summary 0", 1: "Summary 1"},
        topic_keywords={0: [{"token": "w", "score": 0.9}]},
    )
    await test_db_session.commit()
    
    # 2. Get latest
    latest = await TopicResultRepository.get_latest_result(test_db_session, topic_type)
    assert latest is not None
    assert latest.job_id == job_id
    
    # 3. Get by ID
    by_id = await TopicResultRepository.get_by_id(test_db_session, latest.id)
    assert by_id.id == latest.id

@pytest.mark.asyncio
async def test_assignments_and_pagination(test_db_session):
    result_id = uuid4()
    
    # 1. Bulk create
    assignments = [
        {"question": f"Q{i}", "topic_id": i % 2, "source": "test"}
        for i in range(5)
    ]
    count = await TopicResultRepository.bulk_create_assignments(test_db_session, result_id, assignments)
    assert count == 5
    await test_db_session.commit()
    
    # 2. Paginated
    items, total = await TopicResultRepository.get_assignments_paginated(
        test_db_session, result_id, page=1, page_size=2
    )
    assert len(items) == 2
    assert total == 5
    
    # 3. Filter by topic
    items, total = await TopicResultRepository.get_assignments_paginated(
        test_db_session, result_id, topic_id=0
    )
    assert total == 3 # Q0, Q2, Q4

@pytest.mark.asyncio
async def test_pin_state_management(test_db_session):
    job_id = uuid4()
    result = await TopicResultRepository.create(
        test_db_session, job_id, "type", "7d", 1, 1, {0: "S"}, {0: []}
    )
    await test_db_session.commit()
    
    # 1. Upsert pin
    state = await TopicResultRepository.upsert_pin(
        test_db_session, result.id, topic_id=0, pinned=True, knowledge_updated=False
    )
    assert state["pinned"] is True
    await test_db_session.commit()
    
    # 2. Get pin state
    await test_db_session.refresh(result)
    res_state = await TopicResultRepository.get_pin_state(result, 0)
    assert res_state["pinned"] is True
    
    # 3. Get all pin states
    all_states = await TopicResultRepository.get_all_pin_states(result)
    assert 0 in all_states
    assert all_states[0]["pinned"] is True

@pytest.mark.asyncio
async def test_topic_result_repository_empty_cases(test_db_session):
    # assignments empty
    count = await TopicResultRepository.bulk_create_assignments(test_db_session, uuid4(), [])
    assert count == 0
    
    # latest result not found
    latest = await TopicResultRepository.get_latest_result(test_db_session, "non-existent")
    assert latest is None
    
    # upsert pin not found
    with pytest.raises(ValueError, match="not found"):
        await TopicResultRepository.upsert_pin(test_db_session, uuid4(), 0, pinned=True)
