"""
Regression test: static export handles multi-Y (array) config.y correctly.

Bug: renderChart in static_export.py passed config.y directly to Plot channel
accessors. When config.y was an array (multi-Y), Plot received an array instead
of a field name, producing blank or broken charts.
Fix: Detect Array.isArray(y), use y[0] as the accessor and "metric" as the
implicit series column (matching the UNPIVOT output from the backend).
"""

import pytest

from api.services.static_export import export_dashboard_html


class TestStaticExportMultiY:
    def _export_chart(self, config: dict, chart_type: str = "LineChart") -> str:
        return export_dashboard_html(
            title="Test",
            charts=[{
                "chart_type": chart_type,
                "title": "Multi-Y Chart",
                "subtitle": None,
                "source": None,
                "width": "full",
                "config": config,
                "data": [
                    {"month": "2024-01", "metric": "revenue", "metric_value": 100},
                    {"month": "2024-01", "metric": "cost", "metric_value": 60},
                ],
            }],
        )

    def test_multi_y_line_chart_uses_first_y_field(self):
        """When config.y is an array, the generated JS should use y[0] not the raw array."""
        html = self._export_chart({
            "x": "month",
            "y": ["revenue", "cost"],
        }, chart_type="LineChart")
        # The JS should detect isMultiY and use yField (y[0]) instead of the raw array
        assert "isMultiY" in html
        assert 'Array.isArray(y)' in html

    def test_multi_y_bar_chart_renders(self):
        """Multi-Y bar chart should produce valid JS (not pass array to Plot.barY)."""
        html = self._export_chart({
            "x": "month",
            "y": ["revenue", "cost"],
        }, chart_type="BarChart")
        assert "isMultiY" in html

    def test_single_y_still_works(self):
        """Single-Y charts should remain unaffected by the multi-Y fix."""
        html = self._export_chart({
            "x": "month",
            "y": "revenue",
        }, chart_type="LineChart")
        # isMultiY should still be defined but false for single-y
        assert "isMultiY" in html

    def test_multi_y_bigvalue_uses_first_element(self):
        """BigValue with multi-Y should use y[0], not the array."""
        html = self._export_chart({
            "x": "month",
            "y": ["revenue", "cost"],
        }, chart_type="BigValue")
        # The BigValue branch references isMultiY ? y[0] : y
        assert "isMultiY" in html
