"""Unit tests for Geo service - calculate_edge_weight."""

import pytest
from backend.services.geo import (
    polyline_length,
    calculate_edge_weight,
    TYPE_FACTORS,
    Point,
)


class TestPolylineLength:
    def test_empty_polyline(self):
        assert polyline_length([]) == 0.0

    def test_single_point(self):
        assert polyline_length([(0, 0)]) == 0.0

    def test_two_points(self):
        polyline = [(0, 0), (3, 4)]
        assert polyline_length(polyline) == 5.0

    def test_three_points(self):
        polyline = [(0, 0), (3, 0), (3, 4)]
        assert polyline_length(polyline) == 7.0

    def test_straight_line(self):
        polyline = [(0, 0), (1, 0), (2, 0), (3, 0)]
        assert polyline_length(polyline) == 3.0

    def test_complex_polyline(self):
        polyline = [(0, 0), (1, 1), (2, 2), (3, 3)]
        dist = polyline_length(polyline)
        assert abs(dist - 4.242640687119285) < 0.001


class TestCalculateEdgeWeight:
    def test_walk_type_default(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "walk", 1.0)
        assert weight == 5.0

    def test_stairs_factor(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "stairs", 1.0)
        assert weight == 10.0  # 5.0 * 2.0

    def test_elevator_factor(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "elevator", 1.0)
        assert weight == 7.5  # 5.0 * 1.5

    def test_escalator_factor(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "escalator", 1.0)
        assert weight == 5.0  # 5.0 * 1.0

    def test_restricted_type(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "restricted", 1.0)
        assert weight == 4995.0  # 5.0 * 999.0

    def test_unknown_type_defaults_to_walk(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "unknown_type", 1.0)
        assert weight == 5.0  # defaults to factor 1.0

    def test_scale_ratio_applied(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "walk", 0.5)
        assert weight == 2.5  # 5.0 * 0.5 * 1.0

    def test_large_scale_ratio(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "walk", 2.0)
        assert weight == 10.0  # 5.0 * 2.0 * 1.0

    def test_empty_polyline(self):
        weight = calculate_edge_weight([], "walk", 1.0)
        assert weight == 0.0

    def test_single_point_polyline(self):
        weight = calculate_edge_weight([[0, 0]], "walk", 1.0)
        assert weight == 0.0

    def test_complex_polyline_with_stairs(self):
        polyline = [[0, 0], [3, 0], (3, 4)]
        polyline = [[0, 0], [3, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "stairs", 1.0)
        assert weight == 14.0  # (3+4) * 1.0 * 2.0

    def test_stairs_with_scale(self):
        polyline = [[0, 0], [10, 0], [10, 10]]
        weight = calculate_edge_weight(polyline, "stairs", 0.5)
        assert weight == 20.0  # (10+10) * 0.5 * 2.0

    def test_type_factors_contains_expected_keys(self):
        assert "walk" in TYPE_FACTORS
        assert "stairs" in TYPE_FACTORS
        assert "elevator" in TYPE_FACTORS
        assert "escalator" in TYPE_FACTORS
        assert "restricted" in TYPE_FACTORS

    def test_type_factors_values(self):
        assert TYPE_FACTORS["walk"] == 1.0
        assert TYPE_FACTORS["stairs"] == 2.0
        assert TYPE_FACTORS["elevator"] == 1.5
        assert TYPE_FACTORS["escalator"] == 1.0
        assert TYPE_FACTORS["restricted"] == 999.0

    def test_multi_segment_polyline_walk(self):
        polyline = [[0, 0], [10, 0], [10, 10], [20, 10]]
        weight = calculate_edge_weight(polyline, "walk", 1.0)
        assert weight == 30.0  # 10 + 10 + 10

    def test_zero_scale(self):
        polyline = [[0, 0], [3, 4]]
        weight = calculate_edge_weight(polyline, "walk", 0.0)
        assert weight == 0.0
