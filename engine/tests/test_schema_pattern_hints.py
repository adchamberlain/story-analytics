"""
Regression test: DATA PATTERN hints must be mutually exclusive.

Bug: schema_analyzer.py used independent `if` blocks for the chart type hints
(time series, categorical, scatter). Datasets with date + categorical + numeric
columns got contradictory hints simultaneously, degrading LLM chart proposals.
Fix: Changed to elif chain so only the highest-priority hint fires.
"""

import pytest

from engine.v2.schema_analyzer import build_schema_context, ColumnProfile, DataProfile


def _make_profile(cols: list[ColumnProfile]) -> DataProfile:
    return DataProfile(filename="test.csv", row_count=100, columns=cols)


@pytest.mark.unit
class TestSchemaPatternHints:
    def test_date_plus_category_plus_numeric_only_shows_time_series(self):
        """When date + categorical + numeric columns are all present,
        only the time-series hint should fire (highest priority)."""
        profile = _make_profile([
            ColumnProfile("date", "DATE", distinct_count=30, null_count=0,
                         min_value="2024-01-01", max_value="2024-12-31", sample_values=["2024-01-01"]),
            ColumnProfile("region", "VARCHAR", distinct_count=5, null_count=0,
                         sample_values=["East", "West"]),
            ColumnProfile("revenue", "DOUBLE", distinct_count=100, null_count=0,
                         min_value="0", max_value="10000", sample_values=["100"]),
        ])
        context = build_schema_context(profile, "src_test")
        assert "Time series data detected" in context
        assert "Category + metric data detected" not in context

    def test_category_plus_numeric_without_date(self):
        """Without date columns, the categorical hint should fire."""
        profile = _make_profile([
            ColumnProfile("region", "VARCHAR", distinct_count=5, null_count=0,
                         sample_values=["East", "West"]),
            ColumnProfile("revenue", "DOUBLE", distinct_count=100, null_count=0,
                         min_value="0", max_value="10000", sample_values=["100"]),
        ])
        context = build_schema_context(profile, "src_test")
        assert "Category + metric data detected" in context
        assert "Time series data detected" not in context

    def test_multiple_numeric_without_date_or_category(self):
        """With only numeric columns, the scatter hint should fire."""
        profile = _make_profile([
            ColumnProfile("x_val", "DOUBLE", distinct_count=100, null_count=0,
                         sample_values=["1.5"]),
            ColumnProfile("y_val", "DOUBLE", distinct_count=100, null_count=0,
                         sample_values=["2.3"]),
        ])
        context = build_schema_context(profile, "src_test")
        assert "scatter plot" in context.lower() or "Multiple numeric" in context
        assert "Time series" not in context
        assert "Category + metric" not in context
