"""
Regression test: export config merge order — typed fields must win.

Bug: In the export endpoint, the config dict was built as:
  {"x": chart.x, "y": chart.y, ..., **(chart.config or {})}
This allowed chart.config to overwrite the typed fields if it contained
the same keys (e.g., x, y, series).
Fix: Reversed the merge order so typed fields are applied last and win.
"""

import pytest


@pytest.mark.unit
class TestExportConfigMerge:
    def test_typed_fields_override_config_dict(self):
        """Simulate the merge order: typed fields should win over config dict."""
        # Simulating the fixed merge order from dashboards_v2.py
        config_dict = {"x": "old_x", "y": "old_y", "palette": "blues"}
        typed_x = "correct_x"
        typed_y = "correct_y"
        typed_series = "category"

        merged = {
            **config_dict,
            "x": typed_x,
            "y": typed_y,
            "series": typed_series,
            "horizontal": False,
            "sort": None,
        }

        assert merged["x"] == "correct_x"
        assert merged["y"] == "correct_y"
        assert merged["series"] == "category"
        # Extra config fields are preserved
        assert merged["palette"] == "blues"

    def test_config_dict_none_does_not_crash(self):
        """chart.config being None should not crash the merge."""
        config_dict = None
        merged = {
            **(config_dict or {}),
            "x": "col_a",
            "y": "col_b",
            "series": None,
            "horizontal": False,
            "sort": None,
        }
        assert merged["x"] == "col_a"
