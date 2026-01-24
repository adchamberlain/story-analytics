"""
Unit Tests for Chart Models (No LLM Required)

These tests validate the deterministic logic in the chart pipeline:
- ChartConfig building
- Filter spec serialization
- Chart type mapping

Run with: pytest tests/test_chart_models.py -v
"""

import pytest
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.models import (
    Chart,
    ChartConfig,
    ChartSpec,
    ChartType,
    FilterSpec,
    FilterType,
    ValidatedChart,
)


class TestChartType:
    """Test ChartType enum and string conversion."""

    def test_from_string_standard(self):
        assert ChartType.from_string("LineChart") == ChartType.LINE_CHART
        assert ChartType.from_string("BarChart") == ChartType.BAR_CHART
        assert ChartType.from_string("AreaChart") == ChartType.AREA_CHART

    def test_from_string_variations(self):
        """Test various string formats users might provide."""
        assert ChartType.from_string("line") == ChartType.LINE_CHART
        assert ChartType.from_string("Line Chart") == ChartType.LINE_CHART
        assert ChartType.from_string("line_chart") == ChartType.LINE_CHART
        assert ChartType.from_string("LINE-CHART") == ChartType.LINE_CHART

    def test_from_string_aliases(self):
        """Test common aliases."""
        assert ChartType.from_string("kpi") == ChartType.BIG_VALUE
        assert ChartType.from_string("metric") == ChartType.BIG_VALUE
        assert ChartType.from_string("table") == ChartType.DATA_TABLE

    def test_from_string_default(self):
        """Unknown strings default to BarChart."""
        assert ChartType.from_string("unknown") == ChartType.BAR_CHART
        assert ChartType.from_string("") == ChartType.BAR_CHART


class TestFilterType:
    """Test FilterType enum and string conversion."""

    def test_from_string_standard(self):
        assert FilterType.from_string("Dropdown") == FilterType.DROPDOWN
        assert FilterType.from_string("DateRange") == FilterType.DATE_RANGE

    def test_from_string_variations(self):
        assert FilterType.from_string("dropdown") == FilterType.DROPDOWN
        assert FilterType.from_string("select") == FilterType.DROPDOWN
        assert FilterType.from_string("DateRangePicker") == FilterType.DATE_RANGE
        assert FilterType.from_string("date_picker") == FilterType.DATE_RANGE


class TestFilterSpec:
    """Test FilterSpec serialization."""

    def test_to_dict(self):
        f = FilterSpec(
            name="year_filter",
            filter_type=FilterType.DROPDOWN,
            title="Select Year",
            options_column="year",
            options_query_name="years_list",
        )
        d = f.to_dict()

        assert d["name"] == "year_filter"
        assert d["filter_type"] == "Dropdown"
        assert d["title"] == "Select Year"
        assert d["options_column"] == "year"

    def test_from_dict(self):
        d = {
            "name": "status",
            "filter_type": "Dropdown",
            "options_column": "status",
            "default_value": "active",
        }
        f = FilterSpec.from_dict(d)

        assert f.name == "status"
        assert f.filter_type == FilterType.DROPDOWN
        assert f.default_value == "active"

    def test_get_sql_variable(self):
        f = FilterSpec(name="year", filter_type=FilterType.DROPDOWN)
        assert f.get_sql_variable() == "${inputs.year}"

        f = FilterSpec(name="date_range", filter_type=FilterType.DATE_RANGE)
        assert "${inputs.date_range.start}" in f.get_sql_variable()
        assert "${inputs.date_range.end}" in f.get_sql_variable()


class TestChartConfig:
    """Test ChartConfig props generation."""

    def test_basic_config(self):
        config = ChartConfig(x="month", y="revenue")
        props = config.to_props()

        assert props["x"] == "month"
        assert props["y"] == "revenue"

    def test_dual_axis_config(self):
        config = ChartConfig(x="month", y="revenue", y2="count")
        props = config.to_props()

        assert props["y"] == "revenue"
        assert props["y2"] == "count"

    def test_horizontal_config(self):
        config = ChartConfig(x="customer", y="revenue", horizontal=True)
        props = config.to_props()

        assert props.get("swapXY") is True

    def test_stacked_config(self):
        config = ChartConfig(x="month", y=["sales", "returns"], stacked=True)
        props = config.to_props()

        assert props.get("type") == "stacked"

    def test_bigvalue_config(self):
        config = ChartConfig(value="total", value_fmt="usd0")
        props = config.to_props()

        assert props["value"] == "total"
        assert props["fmt"] == "usd0"

    def test_extra_props(self):
        config = ChartConfig(x="month", y="revenue", extra_props={"color": "#ff0000"})
        props = config.to_props()

        assert props["color"] == "#ff0000"


class TestChart:
    """Test Chart serialization."""

    def test_to_dict(self):
        chart = Chart(
            title="Monthly Revenue",
            description="Revenue by month",
            query_name="monthly_revenue",
            sql="SELECT month, SUM(amount) as revenue FROM sales GROUP BY month",
            chart_type=ChartType.LINE_CHART,
        )
        chart.config = ChartConfig(x="month", y="revenue")

        d = chart.to_dict()
        assert d["title"] == "Monthly Revenue"
        assert d["query_name"] == "monthly_revenue"
        assert d["chart_type"] == "LineChart"
        assert d["config"]["x"] == "month"

    def test_from_dict(self):
        d = {
            "id": "test-123",
            "title": "Test Chart",
            "query_name": "test_query",
            "sql": "SELECT 1",
            "chart_type": "BarChart",
            "config": {"x": "category", "y": "value"},
        }
        chart = Chart.from_dict(d)

        assert chart.id == "test-123"
        assert chart.title == "Test Chart"
        assert chart.chart_type == ChartType.BAR_CHART
        assert chart.config.x == "category"

    def test_from_validated(self):
        spec = ChartSpec(
            title="Test",
            description="Test chart",
            original_request="show me a chart",
            metric="revenue",
            chart_type=ChartType.LINE_CHART,
        )
        validated = ValidatedChart(
            spec=spec,
            query_name="test_query",
            sql="SELECT 1",
            columns=["month", "revenue"],
            config=ChartConfig(x="month", y="revenue"),
        )

        chart = Chart.from_validated(validated)

        assert chart.title == "Test"
        assert chart.query_name == "test_query"
        assert chart.chart_type == ChartType.LINE_CHART
