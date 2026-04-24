"""Unit tests for route logic (math helpers)."""

import pytest
from backend.routers.routes import calculate_angle, get_turn_action


class TestCalculateAngle:
    def test_straight_line(self):
        angle = calculate_angle((0, 0), (1, 0), (2, 0))
        assert angle == 0.0

    def test_right_turn_90_degrees(self):
        angle = calculate_angle((0, 0), (1, 0), (1, 1))
        assert 89 <= angle <= 91

    def test_left_turn_90_degrees(self):
        angle = calculate_angle((0, 0), (1, 0), (1, -1))
        assert -91 <= angle <= -89

    def test_continue_straight(self):
        angle = calculate_angle((0, 0), (1, 1), (2, 2))
        assert abs(angle) < 1


class TestGetTurnAction:
    def test_straight(self):
        assert get_turn_action(0) == "straight"
        assert get_turn_action(10) == "straight"
        assert get_turn_action(-10) == "straight"

    def test_slight_right(self):
        assert get_turn_action(20) == "slight_right"
        assert get_turn_action(44) == "slight_right"

    def test_slight_left(self):
        assert get_turn_action(-20) == "slight_left"
        assert get_turn_action(-44) == "slight_left"

    def test_right(self):
        assert get_turn_action(46) == "right"
        assert get_turn_action(90) == "right"
        assert get_turn_action(180) == "right"

    def test_left(self):
        assert get_turn_action(-46) == "left"
        assert get_turn_action(-90) == "left"
        assert get_turn_action(-180) == "left"
