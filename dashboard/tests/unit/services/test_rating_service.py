"""Tests for RatingService."""

from datetime import datetime
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.models import AnswerRating, RatingValue
from src.services.rating_service import RatingService
from src.schemas.rating import RatingCreate

@pytest.fixture
def mock_repo(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr("src.services.rating_service.RatingRepository", mock)
    return mock

@pytest.mark.asyncio
async def test_create_new_rating(mock_repo) -> None:
    mock_repo.get_by_user_run = AsyncMock(return_value=None)
    mock_repo.create = AsyncMock()
    
    db = AsyncMock()
    run_id = str(uuid4())
    payload = RatingCreate(
        run_id=run_id,
        rating=RatingValue.LIKE,
        thread_id="thread-1",
    )
    
    response = await RatingService.create_or_update(db, user_id="user1", rating_data=payload)
    
    assert response.rating == RatingValue.LIKE
    mock_repo.create.assert_called_once()
    db.commit.assert_called_once()

@pytest.mark.asyncio
async def test_update_existing_rating(mock_repo) -> None:
    run_id = str(uuid4())
    existing = AnswerRating(id=uuid4(), user_id="user1", run_id=run_id, rating="LIKE", thread_id="thread-1")
    mock_repo.get_by_user_run = AsyncMock(return_value=existing)
    mock_repo.update = AsyncMock()
    
    db = AsyncMock()
    payload = RatingCreate(
        run_id=run_id,
        rating=RatingValue.DISLIKE,
        comment="Too slow",
        thread_id="thread-1",
    )
    
    response = await RatingService.create_or_update(db, user_id="user1", rating_data=payload)
    
    assert response.rating == RatingValue.DISLIKE
    assert existing.rating == "DISLIKE"
    assert existing.comment == "Too slow"
    mock_repo.update.assert_called_once()

@pytest.mark.asyncio
async def test_validate_comment_length() -> None:
    with pytest.raises(ValidationError) as exc:
        RatingCreate(
            run_id=uuid4(),
            rating=RatingValue.DISLIKE,
            comment="a" * 1001,
            thread_id="thread-1",
        )
    assert "at most 1000 characters" in str(exc.value)

@pytest.mark.asyncio
async def test_validate_comment_allowed_only_for_dislike() -> None:
    with pytest.raises(ValidationError) as exc:
        RatingCreate(
            run_id=uuid4(),
            rating=RatingValue.LIKE,
            comment="Good job",
            thread_id="thread-1",
        )
    assert "only allowed when rating is DISLIKE" in str(exc.value)

@pytest.mark.asyncio
async def test_delete_forbidden(mock_repo) -> None:
    rating = AnswerRating(id=uuid4(), user_id="owner")
    mock_repo.get_by_id = AsyncMock(return_value=rating)
    
    with pytest.raises(HTTPException) as exc:
        # Not owner, not admin
        await RatingService.delete(AsyncMock(), rating_id=rating.id, user_id="other", is_admin=False)
    assert exc.value.status_code == 403

def test_extract_question_answer():
    messages = [
        {"type": "human", "content": "Hello"},
        {"type": "ai", "content": "Hi there", "run_id": "run-123"}
    ]
    
    q, a = RatingService._extract_question_answer(messages, "run-123")
    assert q == "Hello"
    assert a == "Hi there"
    
    # Not found run_id, should fallback to last ai
    q2, a2 = RatingService._extract_question_answer(messages, "other-run")
    assert q2 == "Hello"
    assert a2 == "Hi there"

@pytest.mark.asyncio
async def test_fetch_histories_mocked():
    # Mock httpx.AsyncClient
    mock_response = MagicMock()
    mock_response.json.return_value = {"messages": [{"type": "human", "content": "test"}]}
    mock_response.raise_for_status = MagicMock()
    
    with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_response)):
        items = [AnswerRating(thread_id="t1", user_id="u1")]
        result = await RatingService._fetch_histories_for_items(items)
        
        assert ("t1", "u1") in result
        assert result[("t1", "u1")][0]["content"] == "test"
