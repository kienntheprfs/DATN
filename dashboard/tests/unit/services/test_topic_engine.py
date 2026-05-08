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

@pytest.mark.asyncio
async def test_remote_embedding_model_encode():
    from src.services.topic_engine import RemoteEmbeddingModel
    import httpx
    
    # Mock httpx response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [[0.1] * 10, [0.2] * 10]
    
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    
    with patch("httpx.AsyncClient", return_value=mock_client):
        model = RemoteEmbeddingModel("m1", "http://test.url", hf_token="secret")
        # Test 2 items
        embeddings = await model.encode(["s1", "s2"], batch_size=2)
        
    assert embeddings.shape == (2, 10)
    
@pytest.mark.asyncio
async def test_remote_embedding_model_retry_logic():
    from src.services.topic_engine import RemoteEmbeddingModel
    
    # First attempt 429, second 200
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.headers = {"Retry-After": "0.1"}
    
    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.json.return_value = [[0.5] * 10]
    
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.side_effect = [mock_resp_429, mock_resp_200]
    
    with patch("httpx.AsyncClient", return_value=mock_client), patch("asyncio.sleep", AsyncMock()):
        model = RemoteEmbeddingModel("m1", "http://test.url")
        embeddings = await model.encode(["s1"])
        
    assert embeddings.shape == (1, 10)
    assert mock_client.post.call_count == 2

def test_get_embedding_model_logic():
    from src.services.topic_engine import get_embedding_model, _MODEL_CACHE
    from src.services.util import TopicModelingSettings
    
    _MODEL_CACHE.clear()
    mock_settings = MagicMock()
    mock_settings.embedding_service_url = "http://remote"
    mock_settings.hf_token = None
    
    with patch("src.services.topic_engine.get_settings", return_value=mock_settings):
        model = get_embedding_model("test-model")
        assert "remote:http://remote" in _MODEL_CACHE
        
    _MODEL_CACHE.clear()
    mock_settings.embedding_service_url = None
    with patch("src.services.topic_engine.get_settings", return_value=mock_settings), \
         patch("sentence_transformers.SentenceTransformer", return_value=MagicMock()):
        model = get_embedding_model("local-model")
        assert "local:local-model" in _MODEL_CACHE

def test_find_optimal_clusters_silhouette_loop():
    # Test with enough data to run the silhouette loop
    embeddings = np.random.rand(50, 10)
    # Mock KMeans and silhouette_score
    with patch("src.services.topic_engine._create_cluster_model") as mock_create, \
         patch("sklearn.metrics.silhouette_score", return_value=0.5):
        
        mock_model = MagicMock()
        mock_model.fit_predict.return_value = np.array([0, 1] * 25)
        mock_create.return_value = mock_model
        
        k = find_optimal_clusters(embeddings, min_clusters=2, max_clusters=3)
        assert k in [2, 3]

def test_extract_topic_words_empty_and_error():
    docs = ["doc1"]
    topics = [0]
    
    # Only topic 0 exists
    words = extract_topic_words_c_tfidf(docs, topics)
    assert 0 in words
    assert 1 not in words
    
    # Trigger ValueError in fit_transform
    with patch("sklearn.feature_extraction.text.CountVectorizer.fit_transform", side_effect=ValueError("empty")):
        words = extract_topic_words_c_tfidf(docs, topics)
        assert words[0] == []

def test_analyze_topic_sentiment_edge_cases():
    # Test ImportError
    with patch.dict("sys.modules", {"underthesea": None}):
        # We need to force re-import if it was already imported, 
        # but analyze_topic_sentiment does 'from underthesea import ...' inside
        # so sys.modules patch should work.
        res = analyze_topic_sentiment(["doc"], [0])
        assert res == {}
        
    # Test Exception during sentiment
    with patch("underthesea.sentiment", side_effect=Exception("fail")):
        res = analyze_topic_sentiment(["doc"], [0])
        assert res[0]["neutral"] == 100.0

@pytest.mark.asyncio
async def test_fast_topic_engine_generate_labels():
    engine = FastTopicEngine()
    
    # Labeling disabled
    with patch("src.services.topic_engine.get_settings") as mock_s:
        mock_s.return_value.topic_labeling_enabled = False
        labels = await engine.generate_labels([], [], {})
        assert labels == {}
        
    # Labeling enabled
    with patch("src.services.topic_engine.get_settings") as mock_s, \
         patch("src.services.topic_engine.generate_topic_labels_with_openrouter", AsyncMock(return_value={0: "L"})):
        mock_s.return_value.topic_labeling_enabled = True
        labels = await engine.generate_labels(["d"], [0], {0: []})
        assert labels == {0: "L"}

@pytest.mark.asyncio
async def test_remote_embedding_model_batch_splitting():
    from src.services.topic_engine import RemoteEmbeddingModel
    
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [[0.1]*10]
    
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    
    with patch("httpx.AsyncClient", return_value=mock_client), patch("asyncio.sleep", AsyncMock()):
        model = RemoteEmbeddingModel("m1", "http://test.url")
        # 3 items, batch size 1 -> 3 calls
        await model.encode(["s1", "s2", "s3"], batch_size=1)
        assert mock_client.post.call_count == 3

@pytest.mark.asyncio
async def test_remote_embedding_model_hf_inference_logic():
    from src.services.topic_engine import RemoteEmbeddingModel
    
    # Test HF Inference API URL construction
    model = RemoteEmbeddingModel("m1", "https://api-inference.huggingface.co/models/m1")
    assert model.is_hf_api is True
    
    # Test non-HF URL
    model2 = RemoteEmbeddingModel("m1", "http://localhost:8080")
    assert model2.is_hf_api is False
