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
)

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
