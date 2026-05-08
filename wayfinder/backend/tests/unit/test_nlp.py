import pytest
from backend.services.nlp import normalize_name, extract_a_b

def test_normalize_name():
    # Test cases for TC-UNIT-01 - Đã hỗ trợ tiếng Việt
    assert normalize_name("A4-201") == "a4 201"
    assert normalize_name("Phòng 201, Tòa A4") == "phòng 201 tòa a4"
    assert normalize_name("  Phòng   Họp  ") == "phòng họp"
    assert normalize_name(None) == ""
    assert normalize_name("") == ""

def test_extract_a_b():
    # Test extraction logic - Giữ nguyên dấu tiếng Việt
    assert extract_a_b("Từ Phòng 201 đến Thư viện") == ("phòng 201", "thư viện")
    assert extract_a_b("Đi từ A4-201 tới B4-505") == ("a4 201", "b4 505")
    assert extract_a_b("Chỉ đường tới Thư viện") == (None, "thư viện")
    assert extract_a_b("Thư viện") == (None, "thư viện")
