"""Unit tests for Geo service."""

import pytest
from backend.services.geo import polyline_length, Point


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
