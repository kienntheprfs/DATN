"""Tests for RatingRepository."""

import pytest
from datetime import date
from uuid import uuid4
from src.models import AnswerRating, RatingValue
from src.repositories.rating_repository import RatingRepository
from sqlalchemy import delete

@pytest.fixture(autouse=True)
async def cleanup(test_db_session):
    await test_db_session.execute(delete(AnswerRating))
    await test_db_session.commit()

@pytest.mark.asyncio
async def test_rating_repository_crud(test_db_session):
    rating = AnswerRating(
        user_id="user1",
        run_id="run1",
        rating=RatingValue.LIKE.value,
        thread_id="thread1",
    )
    
    # 1. Create
    await RatingRepository.create(test_db_session, rating)
    await test_db_session.commit()
    
    # 2. Get by user/run
    fetched = await RatingRepository.get_by_user_run(test_db_session, "user1", "run1")
    assert fetched.id == rating.id
    
    # 3. Update
    fetched.rating = RatingValue.DISLIKE.value
    await RatingRepository.update(test_db_session, fetched)
    await test_db_session.commit()
    
    # 4. Get by ID
    by_id = await RatingRepository.get_by_id(test_db_session, rating.id)
    assert by_id.rating == RatingValue.DISLIKE.value
    
    # 5. Delete
    await RatingRepository.delete(test_db_session, by_id)
    await test_db_session.commit()
    assert await RatingRepository.get_by_id(test_db_session, rating.id) is None

@pytest.mark.asyncio
async def test_rating_repository_stats(test_db_session):
    agent_id = "agent1"
    ratings = [
        AnswerRating(user_id=f"u{i}", run_id=f"r{i}", rating=RatingValue.LIKE.value if i < 2 else RatingValue.DISLIKE.value, thread_id="t", agent_id=agent_id)
        for i in range(3)
    ]
    for r in ratings:
        test_db_session.add(r)
    await test_db_session.commit()
    
    total, likes, dislikes = await RatingRepository.get_agent_stats(test_db_session, agent_id)
    assert total == 3
    assert likes == 2
    assert dislikes == 1

@pytest.mark.asyncio
async def test_rating_repository_admin_listing(test_db_session):
    # Create diverse ratings for filtering
    r1 = AnswerRating(user_id="uts", run_id="run_uts", rating=RatingValue.LIKE.value, thread_id="t1", comment="good")
    r2 = AnswerRating(user_id="other", run_id="run2", rating=RatingValue.DISLIKE.value, thread_id="t2", comment="bad")
    test_db_session.add(r1)
    test_db_session.add(r2)
    await test_db_session.commit()
    
    # 1. Search by comment
    items, total = await RatingRepository.list_admin_ratings(test_db_session, page=1, page_size=10, search="good")
    assert total == 1
    assert items[0].user_id == "uts"
    
    # 2. Filter by rating
    items, total = await RatingRepository.list_admin_ratings(test_db_session, page=1, page_size=10, rating=RatingValue.DISLIKE)
    assert total == 1
    assert items[0].user_id == "other"
    
    # 3. Date range
    items, total = await RatingRepository.list_admin_ratings(test_db_session, page=1, page_size=10, from_date=date.today())
    assert total >= 2

@pytest.mark.asyncio
async def test_rating_repository_metadata_resilience(test_db_session):
    thread_map, user_map = await RatingRepository.get_thread_user_metadata(
        test_db_session, thread_ids={"t1"}, user_ids={"u1"}
    )
    assert isinstance(thread_map, dict)
    assert isinstance(user_map, dict)
