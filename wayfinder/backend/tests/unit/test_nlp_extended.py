"""Additional comprehensive tests for NLP service."""

import pytest
from backend.services.nlp import normalize_name, extract_a_b


class TestNormalizeNameExtended:
    def test_empty_string(self):
        assert normalize_name("") == ""

    def test_none_input(self):
        assert normalize_name(None) == ""

    def test_already_normalized(self):
        assert normalize_name("phòng họp") == "phòng họp"

    def test_uppercase_to_lowercase(self):
        assert normalize_name("PHÒNG HỌP") == "phòng họp"

    def test_special_characters_removed(self):
        assert normalize_name("Phòng 201, Tòa A4") == "phòng 201 tòa a4"

    def test_extra_spaces_trimmed(self):
        assert normalize_name("  Phòng   Họp  ") == "phòng họp"

    def test_room_format(self):
        assert normalize_name("A4-201") == "a4 201"

    def test_underscore_as_separator(self):
        assert normalize_name("phòng_họp") == "phòng họp"

    def test_vietnamese_diacritics_preserved(self):
        result = normalize_name("Thư viện")
        assert "thư" in result
        assert "viện" in result

    def test_mixed_special_chars(self):
        assert normalize_name("A4-201@Tòa#A!") == "a4 201 tòa a"

    def test_numbers_preserved(self):
        assert normalize_name("Tầng 3") == "tầng 3"

    def test_only_special_chars(self):
        assert normalize_name("@#$%") == ""

    def test_leading_trailing_whitespace(self):
        assert normalize_name("   hello   ") == "hello"

    def test_single_word(self):
        assert normalize_name("Hello") == "hello"


class TestExtractABExtended:
    def test_empty_query(self):
        assert extract_a_b("") == (None, None)

    def test_none_query(self):
        assert extract_a_b(None) == (None, None)

    def test_from_to_pattern(self):
        result = extract_a_b("Từ Phòng 201 đến Thư viện")
        assert result == ("phòng 201", "thư viện")

    def test_di_from_pattern(self):
        result = extract_a_b("Đi từ A4-201 tới B4-505")
        assert result == ("a4 201", "b4 505")

    def test_only_destination_with_den(self):
        result = extract_a_b("Đến Thư viện")
        assert result == (None, "thư viện")

    def test_only_destination_with_toi(self):
        result = extract_a_b("Tới Sảnh A")
        assert result == (None, "sảnh a")

    def test_only_destination_with_di(self):
        result = extract_a_b("Đi Phòng họp")
        assert result == (None, "phòng họp")

    def test_only_destination_name_only(self):
        result = extract_a_b("Thư viện")
        assert result == (None, "thư viện")

    def test_chi_duong_toi_pattern(self):
        result = extract_a_b("Chỉ đường tới Thư viện")
        assert result == (None, "thư viện")

    def test_chi_duong_den_pattern(self):
        result = extract_a_b("Chỉ đường đến Sảnh B")
        assert result == (None, "sảnh b")

    def test_tim_pattern(self):
        result = extract_a_b("Tìm Phòng 201")
        assert result == (None, "phòng 201")

    def test_ve_pattern(self):
        result = extract_a_b("Về Sảnh A")
        assert result == (None, "sảnh a")

    def test_sang_pattern(self):
        result = extract_a_b("Sang Tòa B")
        assert result == (None, "tòa b")

    def test_whitespace_handling(self):
        result = extract_a_b("  Từ  Phòng A   đến  Phòng B  ")
        assert result == ("phòng a", "phòng b")

    def test_complex_from_to(self):
        result = extract_a_b("Từ Sảnh chính tầng 1 đến Phòng họp 302")
        assert result[0] is not None
        assert result[1] is not None
        assert "sảnh" in result[0]
        assert "phòng" in result[1]
