"""
Regression test: chart proposer coerces LLM boolean values properly.

Bug: LLMs sometimes return "false" (string) instead of false (boolean).
Python treats non-empty strings as truthy, so "false" was evaluated as True,
making charts horizontal when they shouldn't be.
Fix: Added _coerce_bool() that handles string "false"/"true" correctly.
"""

import pytest

from engine.v2.chart_proposer import _coerce_bool


@pytest.mark.unit
class TestCoerceBool:
    def test_bool_true(self):
        assert _coerce_bool(True, False) is True

    def test_bool_false(self):
        assert _coerce_bool(False, True) is False

    def test_string_false(self):
        """Regression: string 'false' from LLM must be treated as False."""
        assert _coerce_bool("false", True) is False

    def test_string_true(self):
        assert _coerce_bool("true", False) is True

    def test_string_False_capitalized(self):
        assert _coerce_bool("False", True) is False

    def test_string_TRUE_uppercase(self):
        assert _coerce_bool("TRUE", False) is True

    def test_string_zero(self):
        assert _coerce_bool("0", True) is False

    def test_string_no(self):
        assert _coerce_bool("no", True) is False

    def test_none_uses_default(self):
        assert _coerce_bool(None, True) is True
        assert _coerce_bool(None, False) is False

    def test_int_zero(self):
        assert _coerce_bool(0, True) is False

    def test_int_one(self):
        assert _coerce_bool(1, False) is True
