"""
Unit Tests for Chart Models (No LLM Required)

These tests validate the deterministic logic in the chart pipeline:
- ChartConfig building
- Evidence markdown generation
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
    """Test FilterSpec component generation."""

    def test_dropdown_component(self):
        f = FilterSpec(
            name="year_filter",
            filter_type=FilterType.DROPDOWN,
            title="Select Year",
            options_column="year",
            options_query_name="years_list",
        )
        component = f.to_evidence_component()

        assert '<Dropdown' in component
        assert 'name="year_filter"' in component
        assert 'data={years_list}' in component
        assert 'value="year"' in component
        assert 'title="Select Year"' in component

    def test_dropdown_with_default(self):
        f = FilterSpec(
            name="status",
            filter_type=FilterType.DROPDOWN,
            options_column="status",
            default_value="active",
        )
        component = f.to_evidence_component()

        assert 'defaultValue="active"' in component

    def test_date_range_component(self):
        f = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            title="Date Range",
        )
        component = f.to_evidence_component()

        assert '<DateRange' in component
        assert 'name="date_range"' in component
        assert 'presetRanges={[' in component
        assert 'defaultValue="Last 12 Months"' in component

    def test_date_range_custom_default(self):
        f = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            default_value="Last 30 Days",
        )
        component = f.to_evidence_component()

        assert 'defaultValue="Last 30 Days"' in component

    def test_filter_serialization_roundtrip(self):
        """Test that filters can be serialized and deserialized."""
        original = FilterSpec(
            name="test_filter",
            filter_type=FilterType.DROPDOWN,
            title="Test",
            options_column="col",
            options_query="SELECT DISTINCT col FROM table",
            default_value="default",
        )

        data = original.to_dict()
        restored = FilterSpec.from_dict(data)

        assert restored.name == original.name
        assert restored.filter_type == original.filter_type
        assert restored.title == original.title
        assert restored.default_value == original.default_value


class TestChartConfig:
    """Test ChartConfig and Evidence props generation."""

    def test_basic_bar_chart_props(self):
        config = ChartConfig(
            x="category",
            y="value",
            title="Sales by Category",
        )
        props = config.to_evidence_props()

        assert props["x"] == "category"
        assert props["y"] == "value"
        assert props["title"] == "Sales by Category"

    def test_horizontal_bar_chart(self):
        config = ChartConfig(
            x="category",
            y="value",
            horizontal=True,
        )
        props = config.to_evidence_props()

        assert props.get("swapXY") is True

    def test_multi_y_columns(self):
        config = ChartConfig(
            x="month",
            y=["revenue", "cost"],
        )
        props = config.to_evidence_props()

        assert props["y"] == ["revenue", "cost"]

    def test_dual_y_axis(self):
        config = ChartConfig(
            x="month",
            y="revenue",
            y2="count",
        )
        props = config.to_evidence_props()

        assert props["y"] == "revenue"
        assert props["y2"] == "count"

    def test_big_value_props(self):
        config = ChartConfig(
            value="total_customers",
            title="Active Customers",
        )
        props = config.to_evidence_props()

        assert props["value"] == "total_customers"
        assert props["title"] == "Active Customers"

    def test_extra_props_merged(self):
        config = ChartConfig(
            x="date",
            y="value",
            extra_props={"fillColor": "#6366f1", "chartAreaHeight": 350},
        )
        props = config.to_evidence_props()

        assert props["fillColor"] == "#6366f1"
        assert props["chartAreaHeight"] == 350


class TestValidatedChart:
    """Test ValidatedChart markdown generation."""

    def test_simple_bar_chart_markdown(self):
        spec = ChartSpec(
            title="Revenue by Segment",
            description="Shows revenue breakdown",
            original_request="show revenue by segment",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )
        chart = ValidatedChart(
            spec=spec,
            query_name="revenue_by_segment",
            sql="SELECT segment, SUM(amount) as revenue FROM invoices GROUP BY segment",
            columns=["segment", "revenue"],
            config=ChartConfig(x="segment", y="revenue", title="Revenue by Segment"),
        )

        md = chart.to_evidence_markdown()

        # Check SQL block
        assert "```sql revenue_by_segment" in md
        assert "SELECT segment" in md
        assert "```" in md

        # Check component
        assert "<BarChart" in md
        assert "data={revenue_by_segment}" in md
        assert 'x="segment"' in md
        assert 'y="revenue"' in md

    def test_line_chart_with_filter(self):
        spec = ChartSpec(
            title="Monthly Revenue",
            description="Revenue over time",
            original_request="monthly revenue with date filter",
            metric="revenue",
            chart_type=ChartType.LINE_CHART,
        )

        date_filter = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            title="Date Range",
        )

        chart = ValidatedChart(
            spec=spec,
            query_name="monthly_revenue",
            sql="SELECT month, revenue FROM data WHERE month >= '${inputs.date_range.start}'",
            columns=["month", "revenue"],
            config=ChartConfig(x="month", y="revenue"),
            filters=[date_filter],
        )

        md = chart.to_evidence_markdown()

        # Check filter component comes before SQL
        assert "<DateRange" in md
        assert md.index("<DateRange") < md.index("```sql")

        # Check chart type
        assert "<LineChart" in md

    def test_chart_with_dropdown_filter_and_query(self):
        spec = ChartSpec(
            title="Revenue by Year",
            description="Revenue filtered by year",
            original_request="revenue by year",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )

        year_filter = FilterSpec(
            name="year_filter",
            filter_type=FilterType.DROPDOWN,
            title="Year",
            options_column="year",
            options_query="SELECT DISTINCT year FROM invoices ORDER BY year",
            options_query_name="years_list",
        )

        chart = ValidatedChart(
            spec=spec,
            query_name="revenue_data",
            sql="SELECT month, revenue FROM data WHERE year = ${inputs.year_filter}",
            columns=["month", "revenue"],
            config=ChartConfig(x="month", y="revenue"),
            filters=[year_filter],
        )

        md = chart.to_evidence_markdown()

        # Check filter query comes first
        assert "```sql years_list" in md
        assert "SELECT DISTINCT year" in md

        # Check dropdown references the query
        assert "data={years_list}" in md

    def test_big_value_markdown(self):
        spec = ChartSpec(
            title="Total Customers",
            description="Count of active customers",
            original_request="total customers KPI",
            metric="customers",
            chart_type=ChartType.BIG_VALUE,
        )
        chart = ValidatedChart(
            spec=spec,
            query_name="customer_count",
            sql="SELECT COUNT(*) as customers FROM customers",
            columns=["customers"],
            config=ChartConfig(value="customers", title="Total Customers"),
        )

        md = chart.to_evidence_markdown()

        assert "<BigValue" in md
        assert 'value="customers"' in md


class TestChartSerialization:
    """Test Chart serialization for persistence."""

    def test_chart_to_dict_and_back(self):
        original = Chart(
            title="Test Chart",
            description="A test chart",
            query_name="test_query",
            sql="SELECT * FROM test",
            chart_type=ChartType.LINE_CHART,
            config=ChartConfig(x="date", y="value"),
            original_request="test chart request",
        )

        data = original.to_dict()
        restored = Chart.from_dict(data)

        assert restored.title == original.title
        assert restored.query_name == original.query_name
        assert restored.sql == original.sql
        assert restored.chart_type == original.chart_type
        assert restored.config.x == original.config.x
        assert restored.config.y == original.config.y

    def test_chart_with_filters_serialization(self):
        f = FilterSpec(
            name="year",
            filter_type=FilterType.DROPDOWN,
            options_column="year",
        )
        original = Chart(
            title="Filtered Chart",
            query_name="q",
            sql="SELECT * FROM t",
            filters=[f],
        )

        data = original.to_dict()
        restored = Chart.from_dict(data)

        assert len(restored.filters) == 1
        assert restored.filters[0].name == "year"
        assert restored.filters[0].filter_type == FilterType.DROPDOWN


class TestChartSpec:
    """Test ChartSpec formatting for prompts."""

    def test_to_prompt_context(self):
        spec = ChartSpec(
            title="Monthly Revenue",
            description="Shows revenue by month",
            original_request="monthly revenue trend",
            metric="revenue",
            aggregation="SUM",
            dimension="month",
            chart_type=ChartType.LINE_CHART,
            relevant_tables=["invoices"],
        )

        context = spec.to_prompt_context()

        assert "Title: Monthly Revenue" in context
        assert "Metric: revenue" in context
        assert "Aggregation: SUM" in context
        assert "Dimension: month" in context
        assert "Chart Type: LineChart" in context
        assert "invoices" in context

    def test_spec_with_interactive_filters(self):
        f = FilterSpec(
            name="date_range",
            filter_type=FilterType.DATE_RANGE,
            date_column="invoice_date",
        )
        spec = ChartSpec(
            title="Test",
            description="Test",
            original_request="test",
            metric="value",
            interactive_filters=[f],
        )

        context = spec.to_prompt_context()

        assert "Interactive Filters:" in context
        assert "DateRange" in context


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
