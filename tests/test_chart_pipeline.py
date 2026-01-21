"""
Tests for the chart-first architecture.

Run with: python -m pytest tests/test_chart_pipeline.py -v
"""

import os
import sys
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

# Load environment variables if dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # dotenv not installed, use existing env vars


class TestChartModels:
    """Test chart data models."""

    def test_chart_type_from_string(self):
        """Test ChartType parsing from various string formats."""
        from engine.models import ChartType

        assert ChartType.from_string("LineChart") == ChartType.LINE_CHART
        assert ChartType.from_string("line") == ChartType.LINE_CHART
        assert ChartType.from_string("BarChart") == ChartType.BAR_CHART
        assert ChartType.from_string("bar") == ChartType.BAR_CHART
        assert ChartType.from_string("BigValue") == ChartType.BIG_VALUE
        assert ChartType.from_string("kpi") == ChartType.BIG_VALUE
        assert ChartType.from_string("unknown") == ChartType.BAR_CHART  # Default

    def test_chart_spec_creation(self):
        """Test ChartSpec creation and serialization."""
        from engine.models import ChartSpec, ChartType

        spec = ChartSpec(
            title="Monthly Revenue",
            description="How is revenue trending over time?",
            original_request="Show me monthly revenue trend",
            metric="revenue",
            aggregation="SUM",
            dimension="month",
            chart_type=ChartType.LINE_CHART,
            relevant_tables=["invoices"],
            filters=["last 12 months"],
        )

        assert spec.title == "Monthly Revenue"
        assert spec.chart_type == ChartType.LINE_CHART
        assert "invoices" in spec.relevant_tables

        # Test prompt context generation
        context = spec.to_prompt_context()
        assert "Monthly Revenue" in context
        assert "revenue" in context
        assert "SUM" in context

    def test_chart_config_to_props(self):
        """Test ChartConfig to Evidence props conversion."""
        from engine.models import ChartConfig

        config = ChartConfig(
            x="month",
            y="revenue",
            title="Monthly Revenue",
            color="#6366f1",
            extra_props={"smooth": 0.3},
        )

        props = config.to_evidence_props()

        assert props["x"] == "month"
        assert props["y"] == "revenue"
        assert props["title"] == "Monthly Revenue"
        assert props["smooth"] == 0.3

    def test_chart_serialization(self):
        """Test Chart serialization to/from dict."""
        from engine.models import Chart, ChartType, ChartConfig

        chart = Chart(
            title="Test Chart",
            description="A test chart",
            query_name="test_query",
            sql="SELECT 1",
            chart_type=ChartType.BAR_CHART,
            config=ChartConfig(x="x", y="y"),
            original_request="Make a test chart",
        )

        # Serialize
        data = chart.to_dict()
        assert data["title"] == "Test Chart"
        assert data["chart_type"] == "BarChart"

        # Deserialize
        restored = Chart.from_dict(data)
        assert restored.title == chart.title
        assert restored.chart_type == chart.chart_type
        assert restored.sql == chart.sql


class TestChartStorage:
    """Test chart storage layer."""

    def test_chart_save_and_load(self, tmp_path):
        """Test saving and loading charts."""
        from engine.models import Chart, ChartType, ChartStorage

        storage = ChartStorage(storage_dir=tmp_path / "charts")

        chart = Chart(
            title="Test Chart",
            description="A test",
            query_name="test",
            sql="SELECT 1",
            chart_type=ChartType.LINE_CHART,
        )

        # Save
        storage.save(chart)

        # Load
        loaded = storage.get(chart.id)
        assert loaded is not None
        assert loaded.title == chart.title
        assert loaded.id == chart.id

    def test_chart_delete(self, tmp_path):
        """Test deleting charts."""
        from engine.models import Chart, ChartType, ChartStorage

        storage = ChartStorage(storage_dir=tmp_path / "charts")

        chart = Chart(
            title="To Delete",
            description="Will be deleted",
            query_name="delete_me",
            sql="SELECT 1",
            chart_type=ChartType.BAR_CHART,
        )

        storage.save(chart)
        assert storage.get(chart.id) is not None

        # Delete
        result = storage.delete(chart.id)
        assert result is True
        assert storage.get(chart.id) is None

    def test_chart_search(self, tmp_path):
        """Test chart search functionality."""
        from engine.models import Chart, ChartType, ChartStorage

        storage = ChartStorage(storage_dir=tmp_path / "charts")

        # Create some charts
        charts = [
            Chart(title="Revenue Trend", query_name="rev", sql="SELECT 1", chart_type=ChartType.LINE_CHART),
            Chart(title="Customer Count", query_name="cust", sql="SELECT 2", chart_type=ChartType.BAR_CHART),
            Chart(title="Revenue by Region", query_name="region", sql="SELECT 3", chart_type=ChartType.BAR_CHART),
        ]

        for c in charts:
            storage.save(c)

        # Search by query
        results = storage.search(query="revenue")
        assert len(results) == 2

        # Search by type
        results = storage.search(chart_type="BarChart")
        assert len(results) == 2


class TestDashboardComposition:
    """Test dashboard composition."""

    def test_dashboard_creation(self, tmp_path):
        """Test creating a dashboard."""
        from engine.models import Dashboard, DashboardLayout

        dashboard = Dashboard(
            slug="test-dashboard",
            title="Test Dashboard",
            description="A test dashboard",
            chart_ids=["chart-1", "chart-2"],
        )

        assert dashboard.title == "Test Dashboard"
        assert len(dashboard.chart_ids) == 2

    def test_dashboard_add_chart(self):
        """Test adding charts to dashboard."""
        from engine.models import Dashboard

        dashboard = Dashboard(
            slug="test",
            title="Test",
            chart_ids=["chart-1"],
        )

        dashboard.add_chart("chart-2")
        assert "chart-2" in dashboard.chart_ids

        # Adding same chart again shouldn't duplicate
        dashboard.add_chart("chart-2")
        assert dashboard.chart_ids.count("chart-2") == 1

    def test_dashboard_markdown_generation(self):
        """Test generating Evidence markdown from dashboard."""
        from engine.models import Dashboard, Chart, ChartType, ChartConfig

        charts = [
            Chart(
                id="chart-1",
                title="Revenue",
                query_name="revenue",
                sql="SELECT date, SUM(amount) as revenue FROM invoices GROUP BY date",
                chart_type=ChartType.LINE_CHART,
                config=ChartConfig(x="date", y="revenue"),
            ),
            Chart(
                id="chart-2",
                title="Customers",
                query_name="customers",
                sql="SELECT COUNT(*) as count FROM customers",
                chart_type=ChartType.BIG_VALUE,
                config=ChartConfig(value="count"),
            ),
        ]

        dashboard = Dashboard(
            slug="test",
            title="Test Dashboard",
            chart_ids=["chart-1", "chart-2"],
        )

        markdown = dashboard.to_evidence_markdown(charts)

        assert "# Test Dashboard" in markdown
        assert "```sql revenue" in markdown
        assert "```sql customers" in markdown
        assert "<LineChart" in markdown
        assert "<BigValue" in markdown


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set"
)
class TestChartPipeline:
    """Integration tests for chart pipeline (requires API key)."""

    def test_requirements_extraction(self):
        """Test extracting chart requirements from natural language."""
        from engine.chart_pipeline import ChartRequirementsAgent
        from engine.schema import get_schema_context

        agent = ChartRequirementsAgent()
        schema = get_schema_context()

        spec = agent.extract_spec(
            "Show me monthly revenue for the last 12 months",
            schema
        )

        assert spec.title is not None
        assert "revenue" in spec.metric.lower()
        assert spec.chart_type is not None

    def test_full_pipeline(self):
        """Test the full chart pipeline end-to-end."""
        from engine.chart_pipeline import ChartPipeline, ChartPipelineConfig

        pipeline = ChartPipeline(ChartPipelineConfig(verbose=True))

        result = pipeline.run("Show me total revenue by month")

        # Pipeline should complete (success or meaningful failure)
        if result.success:
            assert result.chart is not None
            assert result.chart.sql is not None
            assert result.chart.query_name is not None
        else:
            # If it fails, should have an error message
            assert result.error is not None


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set"
)
class TestChartConversation:
    """Integration tests for chart conversation flow."""

    def test_conversation_flow(self):
        """Test the chart conversation flow."""
        from engine.chart_conversation import ChartConversationManager

        manager = ChartConversationManager()

        # Send initial request
        result = manager.process_message("Create a bar chart showing customer count by segment")

        assert result.response is not None
        assert manager.state.phase.value in ["waiting", "generating", "viewing"]

        # If we got to viewing, we should have a chart
        if manager.state.phase.value == "viewing":
            assert result.chart_url is not None or result.chart_id is not None


class TestEmbedMode:
    """Test embed mode layout changes."""

    def test_layout_svelte_has_embed_mode(self):
        """Verify the Evidence layout includes embed mode support."""
        layout_path = Path(__file__).parent.parent / ".evidence" / "template" / "src" / "pages" / "+layout.svelte"

        assert layout_path.exists(), "Layout file should exist"

        content = layout_path.read_text()

        # Check for embed mode query param handling
        assert "embed" in content.lower(), "Layout should reference embed mode"
        assert "isEmbedMode" in content, "Layout should have isEmbedMode variable"
        assert "embed-container" in content, "Layout should have embed container class"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
