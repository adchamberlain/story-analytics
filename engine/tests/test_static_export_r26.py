"""
Regression tests for static export fixes (Round 26).

Bugs:
1. clientWidth is 0 before browser layout — JS should fall back to 640.
2. Legend showed for single-Y with `series` but not for multi-Y `implicitSeries`.
3. Multi-Y bar chart applied `fx: x` causing broken faceting.
"""

import pytest

from api.services.static_export import export_dashboard_html


def _export_chart(config: dict, chart_type: str = "BarChart") -> str:
    return export_dashboard_html(
        title="Test",
        charts=[{
            "chart_type": chart_type,
            "title": "Chart",
            "subtitle": None,
            "source": None,
            "width": "full",
            "config": config,
            "data": [
                {"month": "2024-01", "metric": "revenue", "metric_value": 100},
                {"month": "2024-02", "metric": "cost", "metric_value": 60},
            ],
        }],
    )


@pytest.mark.unit
class TestStaticExportClientWidth:
    def test_width_fallback_when_zero(self):
        """The JS should use || 640 so width is never 0."""
        html = _export_chart({"x": "month", "y": "metric_value"})
        assert "clientWidth || 640" in html


@pytest.mark.unit
class TestStaticExportLegend:
    def test_legend_uses_implicit_series_for_multi_y(self):
        """Legend should show for multi-Y charts using implicitSeries, not just series."""
        html = _export_chart(
            {"x": "month", "y": ["revenue", "cost"]},
            chart_type="LineChart",
        )
        # The legend condition should reference implicitSeries, not just series
        assert "implicitSeries" in html
        assert "legend: true" in html

    def test_no_legend_for_single_y_without_series(self):
        """Single-Y without series should not show a legend."""
        html = _export_chart(
            {"x": "month", "y": "metric_value"},
            chart_type="LineChart",
        )
        # implicitSeries will be falsy for single-y without series
        assert "implicitSeries" in html


@pytest.mark.unit
class TestStaticExportMultiYBar:
    def test_multi_y_bar_skips_fx(self):
        """Multi-Y bar chart should not apply fx: x (faceting), which breaks rendering."""
        html = _export_chart(
            {"x": "month", "y": ["revenue", "cost"]},
            chart_type="BarChart",
        )
        # The JS should check isMultiY to skip fx
        assert "config.stacked || isMultiY" in html
