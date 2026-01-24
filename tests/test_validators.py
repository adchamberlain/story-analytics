"""
Unit tests for the post-LLM validation layer.

These tests verify that the validators correctly detect and fix common
issues that the LLM fails to handle reliably.
"""

import pytest
from unittest.mock import MagicMock, patch

import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.validators import (
    ChartSpecValidator,
    RequestPatternValidator,
    ScaleAnalyzer,
    ScaleAnalysis,
    FilterDefaultResolver,
    DateRangeDefaultExtractor,
)
from engine.models.chart import ChartSpec, ChartType, FilterSpec, FilterType, ChartConfig


# =============================================================================
# RequestPatternValidator Tests
# =============================================================================

class TestRequestPatternValidator:
    """Tests for horizontal bar chart detection."""

    def test_detects_horizontal_bar_pattern(self):
        """Should set horizontal=True when 'horizontal bar' is in request."""
        spec = ChartSpec(
            title="Top 5 Customers",
            description="",
            original_request="Show me a horizontal bar chart of top 5 customers",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,  # LLM failed to set this
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is True

    def test_detects_horizontal_bars_pattern(self):
        """Should set horizontal=True when 'horizontal bars' is in request."""
        spec = ChartSpec(
            title="Revenue by Region",
            description="",
            original_request="Display revenue using horizontal bars",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is True

    def test_detects_bar_chart_horizontal_pattern(self):
        """Should set horizontal=True when 'bar chart horizontal' is in request."""
        spec = ChartSpec(
            title="Sales",
            description="",
            original_request="Create a bar chart horizontal orientation",
            metric="sales",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is True

    def test_preserves_existing_horizontal_true(self):
        """Should not change horizontal if already True."""
        spec = ChartSpec(
            title="Test",
            description="",
            original_request="Show horizontal bar chart",
            metric="value",
            chart_type=ChartType.BAR_CHART,
            horizontal=True,  # Already set correctly
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is True

    def test_does_not_set_horizontal_for_regular_bar(self):
        """Should not set horizontal for regular bar chart requests."""
        spec = ChartSpec(
            title="Revenue",
            description="",
            original_request="Show me a bar chart of revenue by month",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is False

    def test_case_insensitive_matching(self):
        """Should match patterns case-insensitively."""
        spec = ChartSpec(
            title="Test",
            description="",
            original_request="SHOW ME A HORIZONTAL BAR CHART",
            metric="value",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        corrected = RequestPatternValidator.validate_horizontal(spec)

        assert corrected.horizontal is True


# =============================================================================
# DateRangeDefaultExtractor Tests
# =============================================================================

class TestDateRangeDefaultExtractor:
    """Tests for date range default extraction from user request."""

    def test_extracts_last_6_months(self):
        """Should extract 'Last 6 Months' from request."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show data by week for the last 6 months"
        )
        assert default == "Last 6 Months"

    def test_extracts_last_30_days(self):
        """Should extract 'Last 30 Days' from request."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show me the past 30 days of revenue"
        )
        assert default == "Last 30 Days"

    def test_extracts_last_year(self):
        """Should extract 'Last 12 Months' for 'last year' request."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show monthly revenue over the last year"
        )
        assert default == "Last 12 Months"

    def test_extracts_ytd(self):
        """Should extract 'Year to Date' for YTD request."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show year to date revenue"
        )
        assert default == "Year to Date"

    def test_extracts_last_7_days(self):
        """Should extract 'Last 7 Days' for last week request."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show activity from the past week"
        )
        assert default == "Last 7 Days"

    def test_returns_fallback_for_no_match(self):
        """Should return 'Last 12 Months' when no pattern matches."""
        default = DateRangeDefaultExtractor.extract_default(
            "Show me a chart of revenue"
        )
        assert default == "Last 12 Months"

    def test_corrects_filter_spec(self):
        """Should correct filter spec default based on request."""
        filter_spec = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            default_value="Last 12 Months",  # Wrong default
        )

        corrected = DateRangeDefaultExtractor.correct_filter(
            filter_spec,
            "Show data for the last 6 months"
        )

        assert corrected.default_value == "Last 6 Months"

    def test_preserves_non_default_value(self):
        """Should not change if LLM already set a specific (non-default) value."""
        filter_spec = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            default_value="Last 30 Days",  # Already specific
        )

        corrected = DateRangeDefaultExtractor.correct_filter(
            filter_spec,
            "Show data for the last 6 months"  # Different request
        )

        # Should keep the already-set value since it's not the generic default
        assert corrected.default_value == "Last 30 Days"

    def test_ignores_non_date_range_filters(self):
        """Should not modify non-DateRange filters."""
        filter_spec = FilterSpec(
            name="year_filter",
            filter_type=FilterType.DROPDOWN,
            default_value=None,
        )

        corrected = DateRangeDefaultExtractor.correct_filter(
            filter_spec,
            "Show data for the last 6 months"
        )

        assert corrected.default_value is None


# =============================================================================
# ScaleAnalyzer Tests
# =============================================================================

class TestScaleAnalyzer:
    """Tests for scale analysis and dual y-axis detection."""

    def test_detects_scale_mismatch(self):
        """Should detect when metrics have vastly different scales."""
        # Create mock data with revenue ~100k and count ~100
        import pandas as pd

        mock_df = pd.DataFrame({
            "month": ["2024-01", "2024-02", "2024-03"],
            "total_revenue": [100000, 120000, 95000],
            "invoice_count": [80, 95, 72],
        })

        with patch("duckdb.connect") as mock_connect:
            mock_con = MagicMock()
            mock_connect.return_value = mock_con
            mock_con.execute.return_value.fetchdf.return_value = mock_df

            analysis = ScaleAnalyzer.analyze(
                "SELECT month, total_revenue, invoice_count FROM data",
                ["month", "total_revenue", "invoice_count"],
                "/fake/path"
            )

            assert analysis is not None
            assert analysis.needs_dual_axis is True
            assert analysis.scale_ratio > 100  # Revenue is ~1000x count
            assert analysis.primary_column == "total_revenue"
            assert analysis.secondary_column == "invoice_count"

    def test_no_dual_axis_for_similar_scales(self):
        """Should not recommend dual axis when scales are similar."""
        import pandas as pd

        mock_df = pd.DataFrame({
            "month": ["2024-01", "2024-02", "2024-03"],
            "avg_amount": [500, 520, 480],
            "median_amount": [450, 470, 440],
        })

        with patch("duckdb.connect") as mock_connect:
            mock_con = MagicMock()
            mock_connect.return_value = mock_con
            mock_con.execute.return_value.fetchdf.return_value = mock_df

            analysis = ScaleAnalyzer.analyze(
                "SELECT month, avg_amount, median_amount FROM data",
                ["month", "avg_amount", "median_amount"],
                "/fake/path"
            )

            assert analysis is not None
            assert analysis.needs_dual_axis is False
            assert analysis.scale_ratio < 2  # Similar scales

    def test_returns_none_for_single_metric(self):
        """Should return None if only one metric column."""
        analysis = ScaleAnalyzer.analyze(
            "SELECT month, revenue FROM data",
            ["month", "revenue"],
            "/fake/path"
        )

        assert analysis is None

    def test_returns_none_for_three_plus_metrics(self):
        """Should return None if more than 2 metric columns."""
        analysis = ScaleAnalyzer.analyze(
            "SELECT month, a, b, c FROM data",
            ["month", "a", "b", "c"],
            "/fake/path"
        )

        assert analysis is None

    def test_handles_query_errors_gracefully(self):
        """Should return None on query execution errors."""
        with patch("duckdb.connect") as mock_connect:
            mock_connect.side_effect = Exception("Connection failed")

            analysis = ScaleAnalyzer.analyze(
                "SELECT * FROM nonexistent",
                ["month", "col1", "col2"],
                "/fake/path"
            )

            assert analysis is None


# =============================================================================
# ChartSpecValidator Integration Tests
# =============================================================================

class TestChartSpecValidator:
    """Integration tests for the unified validator."""

    def test_validate_spec_applies_all_validators(self):
        """Should apply both horizontal and date range validators."""
        spec = ChartSpec(
            title="Test",
            description="",
            original_request="Show horizontal bar chart for the last 6 months",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,  # Should be corrected
            interactive_filters=[
                FilterSpec(
                    name="date_range",
                    filter_type=FilterType.DATE_RANGE,
                    default_value="Last 12 Months",  # Should be corrected
                )
            ],
        )

        corrected = ChartSpecValidator.validate_spec(spec)

        assert corrected.horizontal is True
        assert corrected.interactive_filters[0].default_value == "Last 6 Months"


# =============================================================================
# Run tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
