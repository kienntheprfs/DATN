"""Tests for utility functions in src/services/util.py."""

import pytest
from src.services.util import (
    parse_tokenizer_backend,
    TokenizerBackend,
    parse_cluster_algorithm,
    ClusteringAlgorithm,
    TopicLabelItem,
    _normalize_alias_key,
    _extract_json_object,
    preprocess_vietnamese_for_fast_topic,
    preprocess_vietnamese_for_bertopic,
    _fallback_topic_label,
    init_vietnamese_tokenizer,
    filter_topic_results_by_frequency,
    generate_topic_labels_with_openrouter,
    TopicModelingPipeline,
    save_topic_modeling_results,
    _retry_delay_seconds,
    _extract_json_object,
    _fallback_topic_label,
    _is_retryable_http_status,
    display_topic_modeling_results,
    LabelingProvider,
    load_sample_docs,
    parse_tokenizer_backend,
    parse_cluster_algorithm,
    apply_topic_frequency_filter_from_settings,
    _post_llm_request,
)
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
import httpx

def test_normalize_alias_key():
    assert _normalize_alias_key("  Spacy  ") == "spacy"
    assert _normalize_alias_key(123) == "123"

def test_parse_tokenizer_backend():
    assert parse_tokenizer_backend("uts") == TokenizerBackend.UNDERTHESEA
    assert parse_tokenizer_backend("SPACY") == TokenizerBackend.SPACY
    assert parse_tokenizer_backend("raw") == TokenizerBackend.NONE
    assert parse_tokenizer_backend(None) == TokenizerBackend.UNDERTHESEA
    assert parse_tokenizer_backend(TokenizerBackend.PYVI) == TokenizerBackend.PYVI
    # Default fallback
    assert parse_tokenizer_backend("unknown", default=TokenizerBackend.PYVI) == TokenizerBackend.PYVI

def test_parse_cluster_algorithm():
    assert parse_cluster_algorithm("k-mean") == ClusteringAlgorithm.KMEANS
    assert parse_cluster_algorithm("mini_batch") == ClusteringAlgorithm.MINIBATCH
    assert parse_cluster_algorithm(None) == ClusteringAlgorithm.KMEANS

def test_topic_label_item_normalization():
    item = TopicLabelItem(topic_id=1, label="  Hoc_phi  ")
    assert item.label == "Hoc phi"
    
    with pytest.raises(ValueError, match="Label is too short"):
        TopicLabelItem(topic_id=1, label=" . ")

def test_extract_json_object():
    text = "Some text before ```json {\"key\": \"value\"} ``` some text after"
    assert _extract_json_object(text) == {"key": "value"}
    
    text_no_blocks = "{\"a\": 1}"
    assert _extract_json_object(text_no_blocks) == {"a": 1}
    
    invalid = "not json"
    assert _extract_json_object(invalid) is None

def test_preprocess_vietnamese_for_fast_topic():
    # Mocking tokenizer as a simple space splitter
    def mock_tokenize(text):
        return text.replace(" ", "_")
    
    result = preprocess_vietnamese_for_fast_topic("Xin chào thế giới?", mock_tokenize)
    # 1. rstrip(?) -> "xin chào thế giới"
    # 2. mock_tokenize -> "xin_chào_thế_giới"
    # 3. join with _ -> "xin_chào_thế_giới"
    assert result == "xin_chào_thế_giới"

def test_preprocess_vietnamese_for_bertopic():
    def mock_tokenize(text):
        return "xin chào thế giới"
    
    result = preprocess_vietnamese_for_bertopic("Xin chào", mock_tokenize)
    assert result == "xin_chào_thế_giới"

def test_fallback_topic_label():
    # Rule-based
    assert _fallback_topic_label(["wifi"], []) == "Hạ tầng wifi và kết nối"
    assert _fallback_topic_label(["học", "phí"], []) == "Học phí và hỗ trợ tài chính"
    
    # First word fallback
    assert _fallback_topic_label(["test_topic"], []) == "test topic"
    
    # Generic fallback
    assert _fallback_topic_label([], []) == "Chủ đề tổng quát"

def test_init_vietnamese_tokenizer():
    # Test NONE
    func, backend = init_vietnamese_tokenizer(TokenizerBackend.NONE)
    assert func is None
    assert backend == TokenizerBackend.NONE
    
    # Test Underthesea (success)
    with patch("underthesea.word_tokenize", return_value="tokenized"):
        func, backend = init_vietnamese_tokenizer(TokenizerBackend.UNDERTHESEA)
        assert func("test") == "tokenized"
        assert backend == TokenizerBackend.UNDERTHESEA
        
    # Test PyVi (ImportError)
    with patch.dict("sys.modules", {"pyvi": None}):
        func, backend = init_vietnamese_tokenizer(TokenizerBackend.PYVI)
        assert func is None
        
    # Test spaCy (success with blank)
    with patch("spacy.load", side_effect=Exception("no model")), \
         patch("spacy.blank") as mock_blank:
        mock_nlp = MagicMock()
        mock_nlp.return_value = [MagicMock(text="t1"), MagicMock(text="t2")]
        mock_blank.return_value = mock_nlp
        func, backend = init_vietnamese_tokenizer(TokenizerBackend.SPACY)
        assert func("t1 t2") == "t1 t2"

def test_filter_topic_results_by_frequency():
    docs = ["d1", "d2", "d3", "d4"]
    topics = [0, 0, 1, 2]
    topic_words = {0: ["w0"], 1: ["w1"], 2: ["w2"]}
    
    # Filter to top 2 topics (0 and 1 have more/equal docs than 2)
    f_docs, f_topics, f_words = filter_topic_results_by_frequency(docs, topics, topic_words, max_topics=2)
    
    assert len(f_docs) == 3 # d1, d2, d3
    assert 2 not in f_words
    assert 0 in f_words
    assert 1 in f_words

@pytest.mark.asyncio
async def test_generate_topic_labels_with_openrouter_success():
    docs = ["d1"]
    topics = [0]
    topic_words = {0: [("w1", 0.9)]}
    
    mock_settings = MagicMock()
    mock_settings.topic_labeling_enabled = True
    mock_settings.labeling_api_key = "key"
    mock_settings.topic_labeling_retry_max_attempts = 1
    mock_settings.topic_labeling_timeout_seconds = 10
    mock_settings.topic_labeling_max_topics = None
    mock_settings.max_samples_per_topic = 10
    
    # Mock provider
    from src.services.util import LabelingProvider
    mock_settings.labeling_provider = LabelingProvider.OPENROUTER
    
    mock_response = {
        "choices": [{"message": {"content": "{\"labels\": [{\"topic_id\": 0, \"label\": \"Label 0\"}]}"}}]
    }
    
    with patch("src.services.util.get_settings", return_value=mock_settings), \
         patch("src.services.util._post_llm_request", AsyncMock(return_value=mock_response)):
        labels = await generate_topic_labels_with_openrouter(docs, topics, topic_words)
        assert labels[0] == "Label 0"

def test_retry_delay_seconds():
    assert _retry_delay_seconds(1, 1.0, 10.0) == 1.0
    assert _retry_delay_seconds(2, 1.0, 10.0) == 2.0
    assert _retry_delay_seconds(5, 1.0, 10.0) == 10.0

def test_save_topic_modeling_results(tmp_path):
    docs = ["doc1"]
    topics = [0]
    topic_words = {0: [("word", 0.5)]}
    topic_labels = {0: "Label"}
    
    output_dir = tmp_path / "output"
    save_topic_modeling_results(docs, topics, topic_words, topic_labels, str(output_dir))
    
    assert (output_dir / "topic_assignments.csv").exists()
    assert (output_dir / "topic_words.txt").exists()
    assert (output_dir / "topic_labels.txt").exists()
    assert (output_dir / "summary.txt").exists()

def test_topic_modeling_pipeline_facade():
    docs = ["d1", "d2"]
    topics = [0, 0]
    topic_words = {0: [("w", 0.5)]}
    
    with patch("src.services.util.apply_topic_frequency_filter_from_settings", return_value=(docs, topics, topic_words)):
        pipeline = TopicModelingPipeline(docs, topics, topic_words)
        assert pipeline.docs == docs
        
        with patch("src.services.util.display_topic_modeling_results") as mock_display:
            pipeline.display_results()
            mock_display.assert_called_once()

def test_extract_json_object():
    assert _extract_json_object(None) is None
    assert _extract_json_object("") is None
    assert _extract_json_object("invalid") is None
    
    # Valid
    assert _extract_json_object('{"a": 1}') == {"a": 1}
    # Markdown
    assert _extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    # Text + JSON
    assert _extract_json_object('Here is it: {"a": 1} ...') == {"a": 1}
    # Nested/Complex invalid
    assert _extract_json_object('{"a": 1') is None

def test_fallback_topic_label():
    # Rule based
    assert _fallback_topic_label(["wifi"], []) == "Hạ tầng wifi và kết nối"
    assert _fallback_topic_label(["học_phí"], []) == "Học phí và hỗ trợ tài chính"
    assert _fallback_topic_label(["tuyển_sinh"], []) == "Tuyển sinh và điều kiện đầu vào"
    
    # Keyword based - this matches the rule for "Ngành học..." because "ngành" is a keyword
    assert _fallback_topic_label(["ngành_học"], []) == "Ngành học và chương trình đào tạo"
    
    # Keyword based - no rule match
    assert _fallback_topic_label(["xyz_abc"], []) == "xyz abc"
    
    # Empty
    assert _fallback_topic_label([], []) == "Chủ đề tổng quát"

def test_is_retryable_http_status():
    assert _is_retryable_http_status(429) is True
    assert _is_retryable_http_status(500) is True
    assert _is_retryable_http_status(200) is False
    assert _is_retryable_http_status(404) is False

def test_display_topic_modeling_results():
    docs = ["d1", "d2"]
    topics = [0, 1]
    topic_words = {0: [("w1", 0.5)], 1: [("w2", 0.5)]}
    
    # Just ensure it runs without error
    with patch("builtins.print") as mock_print:
        display_topic_modeling_results(docs, topics, topic_words)
        assert mock_print.called

@pytest.mark.asyncio
async def test_generate_topic_labels_retry_and_recovery():
    docs = ["d1", "d2"]
    topics = [0, 1]
    topic_words = {0: [("w1", 0.9)], 1: [("w2", 0.9)]}
    
    mock_settings = MagicMock()
    mock_settings.topic_labeling_enabled = True
    mock_settings.labeling_api_key = "key"
    mock_settings.topic_labeling_retry_max_attempts = 2
    mock_settings.topic_labeling_timeout_seconds = 1
    mock_settings.topic_labeling_max_topics = None
    mock_settings.max_samples_per_topic = 5
    mock_settings.labeling_provider = LabelingProvider.OPENROUTER
    mock_settings.topic_labeling_retry_base_delay_seconds = 0
    mock_settings.topic_labeling_retry_max_delay_seconds = 0
    
    # 1. First attempt fails (invalid JSON), second attempt succeeds for topic 0
    # Then recovery pass succeeds for topic 1
    
    call_count = 0
    async def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"choices": [{"message": {"content": "invalid json"}}]}
        if call_count == 2:
            return {"choices": [{"message": {"content": '{"labels": [{"topic_id": 0, "label": "L0"}]}'}}]}
        # Recovery pass for topic 1
        return {"choices": [{"message": {"content": '{"labels": [{"topic_id": 1, "label": "L1"}]}'}}]}

    with patch("src.services.util.get_settings", return_value=mock_settings), \
         patch("src.services.util._post_llm_request", side_effect=mock_post), \
         patch("asyncio.sleep", AsyncMock()):
        
        labels = await generate_topic_labels_with_openrouter(docs, topics, topic_words)
        assert labels[0] == "L0"
        assert labels[1] == "L1"
        assert call_count >= 3

def test_load_sample_docs():
    # Test file exists
    with patch("builtins.open", mock_open(read_data="Q1\n# bertopic\nQ2\n")):
        docs = load_sample_docs()
        assert docs == ["Q1", "Q2"]
    
    # Test file missing
    with patch("builtins.open", side_effect=FileNotFoundError()):
        docs = load_sample_docs()
        assert docs == []

def test_parse_tokenizer_backend():
    assert parse_tokenizer_backend("spacy") == TokenizerBackend.SPACY
    assert parse_tokenizer_backend(TokenizerBackend.PYVI) == TokenizerBackend.PYVI
    assert parse_tokenizer_backend(None) == TokenizerBackend.UNDERTHESEA
    assert parse_tokenizer_backend("invalid") == TokenizerBackend.UNDERTHESEA

def test_parse_cluster_algorithm():
    assert parse_cluster_algorithm("kmeans") == ClusteringAlgorithm.KMEANS
    assert parse_cluster_algorithm(ClusteringAlgorithm.MINIBATCH) == ClusteringAlgorithm.MINIBATCH
    assert parse_cluster_algorithm(None) == ClusteringAlgorithm.KMEANS

def test_apply_topic_frequency_filter():
    docs = ["d1", "d2", "d3"]
    topics = [0, 0, 1]
    words = {0: [], 1: []}
    
    mock_settings = MagicMock()
    mock_settings.topic_labeling_max_topics = 1
    
    with patch("src.services.util.get_settings", return_value=mock_settings), \
         patch("builtins.print") as mock_print:
        f_docs, f_topics, f_words = apply_topic_frequency_filter_from_settings(docs, topics, words)
        assert len(f_topics) == 2
        assert 0 in f_topics
        assert 1 not in f_topics
        assert mock_print.called

@pytest.mark.asyncio
async def test_post_llm_request_logic():
    from src.services.util import LabelingProvider
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True}
    
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    
    with patch("httpx.AsyncClient", return_value=mock_client):
        res = await _post_llm_request(
            payload={}, 
            api_key="key", 
            api_url="http://api", 
            timeout=1, 
            provider=LabelingProvider.OPENROUTER
        )
        assert res["ok"] is True
        # Check OpenRouter header
        args, kwargs = mock_client.post.call_args
        assert kwargs["headers"]["X-Title"] == "fast-topic-modeling"

def test_init_vietnamese_tokenizer_errors():
    from src.services.util import init_vietnamese_tokenizer, TokenizerBackend
    
    # Simulate missing module using a side effect on __import__
    import builtins
    real_import = builtins.__import__
    def mock_import(name, *args, **kwargs):
        if name in ["underthesea", "pyvi", "spacy"]:
            raise ImportError(f"No module named '{name}'")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=mock_import):
        func, _ = init_vietnamese_tokenizer(TokenizerBackend.UNDERTHESEA)
        assert func is None
        
        func, _ = init_vietnamese_tokenizer(TokenizerBackend.PYVI)
        assert func is None

def test_init_vietnamese_tokenizer_exceptions():
    from src.services.util import init_vietnamese_tokenizer, TokenizerBackend
    
    # Exception for Underthesea (generic RuntimeError)
    import builtins
    real_import = builtins.__import__
    def mock_import_fail(name, *args, **kwargs):
        if name == "underthesea":
            raise RuntimeError("unexpected crash")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=mock_import_fail):
        func, _ = init_vietnamese_tokenizer(TokenizerBackend.UNDERTHESEA)
        assert func is None
    
    # Exception for spaCy (all models fail)
    with patch("spacy.load", side_effect=Exception("bad model")), \
         patch("spacy.blank", side_effect=Exception("total fail")):
        func, _ = init_vietnamese_tokenizer(TokenizerBackend.SPACY)
        assert func is None

def test_tokenize_vietnamese_text_logic():
    from src.services.util import tokenize_vietnamese_text
    
    # None
    assert tokenize_vietnamese_text("test", None) == "test"
    
    # TypeError retry
    mock_func = MagicMock(side_effect=[TypeError(), "ok"])
    res = tokenize_vietnamese_text("text", mock_func)
    assert res == "ok"
    assert mock_func.call_count == 2
    
    # List return
    mock_func_list = MagicMock(return_value=["a", "b"])
    assert tokenize_vietnamese_text("text", mock_func_list) == "['a', 'b']"

def test_preprocess_bertopic():
    from src.services.util import preprocess_vietnamese_for_bertopic
    assert preprocess_vietnamese_for_bertopic("test", None) == "test"
    assert preprocess_vietnamese_for_bertopic("xin chào", lambda x: "xin chào") == "xin_chào"

@pytest.mark.asyncio
async def test_util_retry_delay_seconds_branches():
    from src.services.util import _retry_delay_seconds
    # Base delay 2, attempt 1 -> 2
    assert _retry_delay_seconds(1, 2, 10) == 2
    # Attempt 2 -> 4
    assert _retry_delay_seconds(2, 2, 10) == 4
    # Max delay 10
    assert _retry_delay_seconds(10, 2, 5) == 5

def test_save_topic_modeling_results():
    from src.services.util import save_topic_modeling_results
    docs = ["d1", "d2"]
    topics = [0, 1]
    topic_words = {0: [("w1", 0.9)], 1: [("w2", 0.9)]}
    topic_labels = {0: "L0", 1: "L1"}
    
    # Use a real temporary directory
    import tempfile
    import os
    with tempfile.TemporaryDirectory() as tmpdir:
        save_topic_modeling_results(docs, topics, topic_words, topic_labels, output_dir=tmpdir)
        assert os.path.exists(os.path.join(tmpdir, "topic_labels.txt"))
        assert os.path.exists(os.path.join(tmpdir, "summary.txt"))

def test_print_topic_labeling_configuration():
    from src.services.util import print_topic_labeling_configuration, TokenizerBackend
    with patch("builtins.print") as mock_print:
        print_topic_labeling_configuration(10, 5, TokenizerBackend.SPACY)
        assert mock_print.called
