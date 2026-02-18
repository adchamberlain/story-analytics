"""
Regression test: build_query aggregation branches include LIMIT clause.

Bug: The COUNT(*) and general aggregation branches in build_query omitted
LIMIT, allowing unbounded GROUP BY results on high-cardinality columns.
Fix: Added LIMIT 10000 to both branches, consistent with multi-Y path.
"""

import re

import pytest


class TestBuildQueryLimit:
    def _get_source(self) -> str:
        """Read the charts_v2.py source for inspection."""
        from pathlib import Path
        path = Path(__file__).parent.parent.parent / "api" / "routers" / "charts_v2.py"
        return path.read_text()

    def test_count_branch_has_limit(self):
        """The COUNT(*) aggregation branch must include a LIMIT clause."""
        source = self._get_source()
        # Find the count branch by its distinctive comment/code
        count_section = source[source.index('COUNT(*) AS "count"'):]
        count_section = count_section[:count_section.index("elif not y:")]
        assert "LIMIT" in count_section, "COUNT(*) aggregation branch is missing LIMIT"

    def test_general_aggregation_branch_has_limit(self):
        """The general aggregation branch (SUM/AVG/MIN/MAX) must include LIMIT."""
        source = self._get_source()
        # Find the general aggregation section between "Aggregated query" and "# Execute"
        agg_section = source[source.index("# Aggregated query"):]
        agg_section = agg_section[:agg_section.index("# Execute")]
        assert "LIMIT" in agg_section, "General aggregation branch is missing LIMIT"
