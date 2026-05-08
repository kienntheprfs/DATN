"""Unit tests for route helper functions in routes.py."""

import pytest
import math
from backend.routers.routes import (
    calculate_angle,
    get_turn_action,
    get_distance,
    get_edge_polyline,
    build_full_polyline,
)


class TestCalculateAngle:
    def test_straight_line_zero_angle(self):
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (2, 0)
        angle = calculate_angle(p1, p2, p3)
        assert abs(angle) < 0.001

    def test_right_turn_90_degrees(self):
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (1, 1)
        angle = calculate_angle(p1, p2, p3)
        assert angle > 0

    def test_left_turn_90_degrees(self):
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (1, -1)
        angle = calculate_angle(p1, p2, p3)
        assert angle < 0

    def test_u_turn_180_degrees(self):
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (0, 0)
        angle = calculate_angle(p1, p2, p3)
        assert abs(abs(angle) - 180) < 0.001

    def test_same_points(self):
        p1 = (0, 0)
        p2 = (0, 0)
        p3 = (0, 0)
        angle = calculate_angle(p1, p2, p3)
        assert angle == 0.0


class TestGetTurnAction:
    def test_straight_small_angle(self):
        assert get_turn_action(0) == "straight"
        assert get_turn_action(10) == "straight"
        assert get_turn_action(-10) == "straight"

    def test_slight_right(self):
        assert get_turn_action(30) == "slight_right"

    def test_slight_left(self):
        assert get_turn_action(-30) == "slight_left"

    def test_right_turn(self):
        assert get_turn_action(60) == "right"
        assert get_turn_action(90) == "right"
        assert get_turn_action(120) == "right"

    def test_left_turn(self):
        assert get_turn_action(-60) == "left"
        assert get_turn_action(-90) == "left"
        assert get_turn_action(-120) == "left"

    def test_boundary_45_degrees(self):
        assert get_turn_action(46) == "right"
        assert get_turn_action(-46) == "left"

    def test_boundary_15_degrees(self):
        assert get_turn_action(16) == "slight_right"
        assert get_turn_action(-16) == "slight_left"


class TestGetDistance:
    def test_same_points(self):
        assert get_distance((0, 0), (0, 0)) == 0.0

    def test_horizontal(self):
        assert get_distance((0, 0), (3, 0)) == 3.0

    def test_vertical(self):
        assert get_distance((0, 0), (0, 4)) == 4.0

    def test_diagonal(self):
        assert get_distance((0, 0), (3, 4)) == 5.0

    def test_negative_coords(self):
        assert get_distance((-1, -1), (1, 1)) == pytest.approx(2.828, abs=0.01)


class TestGetEdgePolyline:
    def test_no_edge_data(self):
        class MockGraph:
            def get_edge_data(self, u, v):
                return None

        result = get_edge_polyline(MockGraph(), 1, 2, {})
        assert result == []

    def test_empty_polyline(self):
        class MockGraph:
            def get_edge_data(self, u, v):
                return {"polyline": []}

        result = get_edge_polyline(MockGraph(), 1, 2, {})
        assert result == []

    def test_no_node_positions(self):
        class MockGraph:
            def get_edge_data(self, u, v):
                return {"polyline": [[0, 0], [1, 1]]}

        result = get_edge_polyline(MockGraph(), 1, 2, {})
        assert result == [[0, 0], [1, 1]]

    def test_correct_direction(self):
        class MockGraph:
            def get_edge_data(self, u, v):
                return {"polyline": [[0, 0], [5, 5], [10, 10]]}

        node_pos = {1: (0, 0), 2: (10, 10)}
        result = get_edge_polyline(MockGraph(), 1, 2, node_pos)
        assert result == [[0, 0], [5, 5], [10, 10]]

    def test_reverse_when_needed(self):
        class MockGraph:
            def get_edge_data(self, u, v):
                return {"polyline": [[10, 10], [5, 5], [0, 0]]}

        node_pos = {1: (0, 0), 2: (10, 10)}
        result = get_edge_polyline(MockGraph(), 1, 2, node_pos)
        assert result == [[0, 0], [5, 5], [10, 10]]


class TestBuildFullPolyline:
    def test_single_node(self):
        class MockGraph:
            nodes = {1: {"floor": 1}}

            def get_edge_data(self, u, v):
                return None

        node_pos = {1: (0, 0)}
        result = build_full_polyline(MockGraph(), [1], node_pos)
        assert result == [[0, 0]]

    def test_two_nodes_no_edge_polyline(self):
        class MockGraph:
            nodes = {1: {"floor": 1}, 2: {"floor": 1}}

            def get_edge_data(self, u, v):
                return None

        node_pos = {1: (0, 0), 2: (10, 0)}
        result = build_full_polyline(MockGraph(), [1, 2], node_pos)
        assert result == [[0, 0], [10, 0]]

    def test_three_nodes_with_edge_polyline(self):
        class MockGraph:
            nodes = {1: {"floor": 1}, 2: {"floor": 1}, 3: {"floor": 1}}

            def get_edge_data(self, u, v):
                if (u, v) == (1, 2):
                    return {"polyline": [[0, 0], [5, 5], [10, 0]], "type": "walk"}
                if (u, v) == (2, 3):
                    return {"polyline": [[10, 0], [15, 5], [20, 0]], "type": "walk"}
                return None

        node_pos = {1: (0, 0), 2: (10, 0), 3: (20, 0)}
        result = build_full_polyline(MockGraph(), [1, 2, 3], node_pos)
        assert len(result) >= 3

    def test_skips_cross_floor_stairs_polyline(self):
        class MockGraph:
            nodes = {1: {"floor": 1}, 2: {"floor": 2}}

            def get_edge_data(self, u, v):
                return {"polyline": [[0, 0], [5, 5]], "type": "stairs"}

        node_pos = {1: (0, 0), 2: (10, 10)}
        result = build_full_polyline(MockGraph(), [1, 2], node_pos)
        assert result == [[0, 0], [10, 10]]
