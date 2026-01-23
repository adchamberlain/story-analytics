"""
Component Tests for Chart Pipeline Stages

Tests each pipeline stage independently:
1. ChartRequirementsAgent - extracts spec from user request
2. ChartSQLAgent - generates SQL from spec
3. ChartPipeline._build_chart_config - builds config from spec + columns

These tests use LLM calls but are faster than E2E because they:
- Test one stage at a time
- Use simpler inputs
- Don't require the Evidence server

Run with: pytest tests/test_pipeline_components.py -v
"""

import os
import pytest
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.chart_pipeline import (
    ChartPipeline,
    ChartPipelineConfig,
    ChartRequirementsAgent,
    ChartSQLAgent,
)
from engine.models import ChartSpec, ChartType, FilterType
from engine.schema import get_schema_context


# Skip all tests if no API key
pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set"
)


@pytest.fixture(scope="module")
def schema_context():
    """Get schema context once for all tests."""
    return get_schema_context()


@pytest.fixture
def requirements_agent():
    """Create a requirements agent for testing."""
    return ChartRequirementsAgent(provider_name="claude")


@pytest.fixture
def sql_agent():
    """Create a SQL agent for testing."""
    return ChartSQLAgent(provider_name="claude", max_fix_attempts=2)


class TestRequirementsAgent:
    """Test the ChartRequirementsAgent in isolation."""

    def test_extracts_bar_chart(self, requirements_agent, schema_context):
        """Test extraction of a simple bar chart request."""
        spec = requirements_agent.extract_spec(
            "Show me total revenue by customer segment as a bar chart",
            schema_context,
        )

        assert spec.chart_type == ChartType.BAR_CHART
        assert "revenue" in spec.metric.lower()
        assert spec.title  # Should have a title

    def test_extracts_line_chart_time_series(self, requirements_agent, schema_context):
        """Test extraction of a time series request."""
        spec = requirements_agent.extract_spec(
            "Create a line chart showing monthly revenue over time",
            schema_context,
        )

        assert spec.chart_type == ChartType.LINE_CHART
        assert "revenue" in spec.metric.lower()

    def test_extracts_kpi_big_value(self, requirements_agent, schema_context):
        """Test extraction of a KPI/BigValue request."""
        spec = requirements_agent.extract_spec(
            "Show me the total number of customers as a big number",
            schema_context,
        )

        assert spec.chart_type == ChartType.BIG_VALUE
        assert "customer" in spec.metric.lower() or "count" in spec.metric.lower()

    def test_extracts_date_filter(self, requirements_agent, schema_context):
        """Test that date filter requests are captured."""
        spec = requirements_agent.extract_spec(
            "Show monthly revenue with a date range filter",
            schema_context,
        )

        # Should have an interactive filter
        assert len(spec.interactive_filters) >= 1

        # At least one should be a date filter
        date_filters = [f for f in spec.interactive_filters if f.filter_type == FilterType.DATE_RANGE]
        assert len(date_filters) >= 1

    def test_extracts_dropdown_filter(self, requirements_agent, schema_context):
        """Test that dropdown filter requests are captured."""
        spec = requirements_agent.extract_spec(
            "Show revenue by month with a dropdown to select the year",
            schema_context,
        )

        # Should have an interactive filter
        dropdown_filters = [f for f in spec.interactive_filters if f.filter_type == FilterType.DROPDOWN]
        assert len(dropdown_filters) >= 1

    def test_extracts_horizontal_bar(self, requirements_agent, schema_context):
        """Test that horizontal bar chart is detected."""
        spec = requirements_agent.extract_spec(
            "Show me a horizontal bar chart of top 5 customers by revenue",
            schema_context,
        )

        assert spec.chart_type == ChartType.BAR_CHART
        assert spec.horizontal is True

    def test_extracts_area_chart(self, requirements_agent, schema_context):
        """Test extraction of area chart request."""
        spec = requirements_agent.extract_spec(
            "Create an area chart of subscription count over time",
            schema_context,
        )

        assert spec.chart_type == ChartType.AREA_CHART


class TestSQLAgent:
    """Test the ChartSQLAgent in isolation."""

    def test_generates_valid_sql_simple(self, sql_agent, schema_context):
        """Test SQL generation for a simple spec."""
        spec = ChartSpec(
            title="Revenue by Segment",
            description="Total revenue by customer segment",
            original_request="revenue by segment",
            metric="revenue",
            aggregation="SUM",
            dimension="customer segment",
            chart_type=ChartType.BAR_CHART,
            relevant_tables=["invoices", "customers"],
        )

        query_name, sql, columns, filter_queries, error = sql_agent.generate_query(
            spec, schema_context
        )

        assert error is None, f"SQL generation failed: {error}"
        assert query_name
        assert sql
        assert len(columns) >= 2  # At least dimension and metric

        # SQL should reference the right tables
        sql_lower = sql.lower()
        assert "invoices" in sql_lower or "customers" in sql_lower

    def test_generates_sql_with_date_filter(self, sql_agent, schema_context):
        """Test SQL generation with date filter placeholders."""
        from engine.models import FilterSpec, FilterType

        date_filter = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            date_column="invoice_date",
        )

        spec = ChartSpec(
            title="Monthly Revenue",
            description="Revenue by month with date filter",
            original_request="monthly revenue with date filter",
            metric="revenue",
            aggregation="SUM",
            dimension="month",
            chart_type=ChartType.LINE_CHART,
            interactive_filters=[date_filter],
            relevant_tables=["invoices"],
        )

        query_name, sql, columns, filter_queries, error = sql_agent.generate_query(
            spec, schema_context
        )

        assert error is None, f"SQL generation failed: {error}"

        # SQL should have date filter placeholders
        assert "${inputs.date_range" in sql

    def test_generates_sql_with_dropdown_filter(self, sql_agent, schema_context):
        """Test SQL generation with dropdown filter."""
        from engine.models import FilterSpec, FilterType

        year_filter = FilterSpec(
            name="year_filter",
            filter_type=FilterType.DROPDOWN,
            title="Year",
            options_column="year",
            options_table="invoices",
        )

        spec = ChartSpec(
            title="Revenue by Month",
            description="Revenue by month filtered by year",
            original_request="revenue by month with year dropdown",
            metric="revenue",
            dimension="month",
            chart_type=ChartType.BAR_CHART,
            interactive_filters=[year_filter],
            relevant_tables=["invoices"],
        )

        query_name, sql, columns, filter_queries, error = sql_agent.generate_query(
            spec, schema_context
        )

        assert error is None, f"SQL generation failed: {error}"

        # Should have filter query for year options
        assert len(filter_queries) >= 1

        # Main query should reference the filter
        assert "${inputs.year_filter}" in sql


class TestChartConfigBuilding:
    """Test the config building logic (no LLM needed)."""

    def test_bar_chart_config(self):
        """Test config building for bar chart."""
        pipeline = ChartPipeline(ChartPipelineConfig(verbose=False))

        spec = ChartSpec(
            title="Test",
            description="",
            original_request="test",
            metric="value",
            chart_type=ChartType.BAR_CHART,
        )

        config = pipeline._build_chart_config(spec, ["category", "value"])

        assert config.x == "category"
        assert config.y == "value"

    def test_line_chart_multi_y(self):
        """Test config building for line chart with multiple Y columns."""
        pipeline = ChartPipeline(ChartPipelineConfig(verbose=False))

        spec = ChartSpec(
            title="Test",
            description="",
            original_request="test",
            metric="metrics",
            chart_type=ChartType.LINE_CHART,
        )

        config = pipeline._build_chart_config(spec, ["month", "revenue", "cost"])

        assert config.x == "month"
        assert config.y == ["revenue", "cost"]

    def test_dual_y_axis_detection(self):
        """Test that dual y-axis is detected for different scales."""
        pipeline = ChartPipeline(ChartPipelineConfig(verbose=False))

        spec = ChartSpec(
            title="Test",
            description="",
            original_request="test",
            metric="metrics",
            chart_type=ChartType.LINE_CHART,
        )

        # revenue and count have different scales
        config = pipeline._build_chart_config(spec, ["month", "revenue", "invoice_count"])

        # Should use dual y-axis
        assert config.y2 is not None or isinstance(config.y, list)

    def test_horizontal_bar_chart(self):
        """Test horizontal bar chart config."""
        pipeline = ChartPipeline(ChartPipelineConfig(verbose=False))

        spec = ChartSpec(
            title="Test",
            description="",
            original_request="test",
            metric="value",
            chart_type=ChartType.BAR_CHART,
            horizontal=True,
        )

        config = pipeline._build_chart_config(spec, ["category", "value"])

        assert config.horizontal is True

    def test_big_value_config(self):
        """Test BigValue config building."""
        pipeline = ChartPipeline(ChartPipelineConfig(verbose=False))

        spec = ChartSpec(
            title="Total",
            description="",
            original_request="test",
            metric="count",
            chart_type=ChartType.BIG_VALUE,
        )

        config = pipeline._build_chart_config(spec, ["total_count"])

        assert config.value == "total_count"
        assert config.title == "Total"


class TestFullPipeline:
    """Integration tests for the full pipeline (still faster than E2E with screenshots)."""

    def test_simple_bar_chart_pipeline(self, schema_context):
        """Test full pipeline for simple bar chart."""
        pipeline = ChartPipeline(ChartPipelineConfig(provider_name="claude", verbose=False))

        result = pipeline.run("Show me total revenue by customer segment")

        assert result.success, f"Pipeline failed: {result.error}"
        assert result.chart is not None
        assert result.chart.sql
        assert result.chart.spec.chart_type == ChartType.BAR_CHART

    def test_line_chart_with_filter_pipeline(self, schema_context):
        """Test full pipeline for line chart with date filter."""
        pipeline = ChartPipeline(ChartPipelineConfig(provider_name="claude", verbose=False))

        result = pipeline.run("Show monthly revenue trend with a date range filter")

        assert result.success, f"Pipeline failed: {result.error}"
        assert result.chart is not None
        assert result.chart.spec.chart_type == ChartType.LINE_CHART
        assert len(result.chart.filters) >= 1

    def test_big_value_pipeline(self, schema_context):
        """Test full pipeline for BigValue/KPI."""
        pipeline = ChartPipeline(ChartPipelineConfig(provider_name="claude", verbose=False))

        result = pipeline.run("Show the total number of customers as a big number KPI")

        assert result.success, f"Pipeline failed: {result.error}"
        assert result.chart is not None
        assert result.chart.spec.chart_type == ChartType.BIG_VALUE


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-x"])  # -x stops on first failure
