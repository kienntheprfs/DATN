"""Tests for FastTopicEngine and related logic in src/services/topic_engine.py."""

from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from src.services.topic_engine import (
    _create_cluster_model,
    find_optimal_clusters,
    extract_topic_words_c_tfidf,
    analyze_topic_sentiment,
    FastTopicEngine,
)

def test_create_cluster_model():
    from sklearn.cluster import KMeans, MiniBatchKMeans
    
    kmeans = _create_cluster_model(n_clusters=5, random_seed=42, cluster_algorithm="kmeans")
    assert isinstance(kmeans, KMeans)
    assert kmeans.n_clusters == 5
    
    minibatch = _create_cluster_model(n_clusters=3, random_seed=42, cluster_algorithm="minibatch")
    assert isinstance(minibatch, MiniBatchKMeans)
    assert minibatch.n_clusters == 3

def test_find_optimal_clusters_small_data():
    # If embeddings <= min_clusters, should return fallback
    embeddings = np.random.rand(2, 10)
    k = find_optimal_clusters(embeddings, min_clusters=3)
    assert k == 2

def test_extract_topic_words_c_tfidf():
    docs = ["xin chào", "tạm biệt", "xin chào"]
    topics = [0, 1, 0]
    
    with patch("src.services.topic_engine.VIETNAMESE_STOPWORDS", []):
        words = extract_topic_words_c_tfidf(docs, topics, n_top_words=2)
        
    assert 0 in words
    assert 1 in words
    # Topic 0 has "xin chào" twice. Top word should be "xin" or "chào"
    assert len(words[0]) > 0
    assert words[0][0][0] in ["xin", "chào", "xin chào"]

def test_analyze_topic_sentiment_mocked():
    docs = ["tôi thích", "tôi ghét"]
    topics = [0, 0]
    
    # Mock underthesea.sentiment
    mock_sentiment = MagicMock(return_value="positive")
    
    with patch("underthesea.sentiment", mock_sentiment):
        results = analyze_topic_sentiment(docs, topics)
        
    assert 0 in results
    assert results[0]["positive"] == 100.0

@pytest.mark.asyncio
async def test_fast_topic_engine_fit_predict(monkeypatch):
    # Mock fast_topic_modeling to avoid heavy loading
    mock_ftm = AsyncMock(return_value=(
        np.array([0, 1]), # topics
        {0: [("w1", 0.5)], 1: [("w2", 0.4)]}, # words
        np.random.rand(2, 10), # embeddings
        MagicMock(), # model
        {0: {"pos": 50}, 1: {"pos": 30}} # sentiment
    ))
    
    import src.services.topic_engine
    monkeypatch.setattr(src.services.topic_engine, "fast_topic_modeling", mock_ftm)
    
    engine = FastTopicEngine(n_clusters=2)
    topics, words, sentiment = await engine.fit_predict(["d1", "d2"])
    
    assert topics == [0, 1]
    assert words[0][0][0] == "w1"
    assert sentiment[0]["pos"] == 50
