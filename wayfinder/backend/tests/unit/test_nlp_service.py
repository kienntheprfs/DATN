"""Unit tests for NLP service."""

import pytest
from backend.services.nlp import normalize_name, extract_a_b


class TestNormalizeName:
    def test_normalize_empty_string(self):
        assert normalize_name("") == ""

    def test_normalize_none(self):
        assert normalize_name(None) == ""

    def test_normalize_lowercase(self):
        assert normalize_name("HELLO WORLD") == "hello world"

    def test_normalize_strips_whitespace(self):
        assert normalize_name("  hello  ") == "hello"

    def test_normalize_preserves_vietnamese(self):
        assert normalize_name("Phòng Học") == "phòng học"


class TestExtractAB:
    def test_extract_from_to(self):
        start, end = extract_a_b("Từ Sảnh A đến Thang máy")
        assert start == "sảnh a"
        assert end == "thang máy"

    def test_extract_di_tu(self):
        start, end = extract_a_b("Đi từ Phòng 101 tới Phòng 202")
        assert start == "phòng 101"
        assert end == "phòng 202"

    def test_extract_sang(self):
        start, end = extract_a_b("Từ Nhà vệ sinh sang Căn tin")
        assert start == "nhà vệ sinh"
        assert end == "căn tin"

    def test_extract_ve(self):
        start, end = extract_a_b("Từ Sân vườn về Sảnh chính")
        assert start == "sân vườn"
        end == "sảnh chính"

    def test_extract_destination_only(self):
        start, end = extract_a_b("Đến Thang máy")
        assert start is None
        assert end == "thang máy"

    def test_extract_tim(self):
        start, end = extract_a_b("Tìm Phòng Họp")
        assert start is None
        assert end == "phòng họp"

    def test_extract_plain_destination(self):
        start, end = extract_a_b("Phòng 101")
        assert start is None
        assert end == "phòng 101"

    def test_extract_multiple_words(self):
        start, end = extract_a_b("Đi từ Khoa Công Nghệ Thông Tin đến Phòng Hành Chính")
        assert start == "khoa công nghệ thông tin"
        assert end == "phòng hành chính"
