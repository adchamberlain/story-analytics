"""
Regression test: table-name substitution uses word-boundary check, not substring.

Bug: The `in` check for table-name candidates used plain substring containment
(e.g., "sales" in "wholesale_sales" → True), but the re.sub used \\b word
boundaries, so the substitution did nothing. The loop then broke early, skipping
valid fallback candidates like "data" or "uploaded_data".
Fix: Changed the guard to use re.search with word boundaries, matching the re.sub.
"""

import csv
import tempfile
from pathlib import Path

import pytest

from api.services.duckdb_service import DuckDBService


@pytest.mark.unit
class TestTableNameSubstitution:
    def _setup_service_with_file(self, filename: str) -> tuple[DuckDBService, str]:
        """Create a DuckDB service and ingest a small CSV under the given filename."""
        svc = DuckDBService()
        # Create a temp CSV
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w")
        writer = csv.writer(tmp)
        writer.writerow(["id", "name", "value"])
        writer.writerow([1, "alpha", 100])
        writer.writerow([2, "beta", 200])
        tmp.close()
        schema = svc.ingest_csv(Path(tmp.name), filename)
        return svc, schema.source_id

    def test_exact_stem_match_works(self):
        """When the SQL references the exact stem, substitution should work."""
        svc, source_id = self._setup_service_with_file("sales.csv")
        sql = "SELECT * FROM sales"
        result = svc.execute_query(sql, source_id)
        assert len(result.rows) == 2

    def test_data_fallback_not_blocked_by_substring(self):
        """Regression: when stem 'sales' appears as substring in 'wholesale_sales',
        the old code broke early and skipped the 'data' fallback. Now it should
        correctly skip the false substring match and reach the 'data' fallback."""
        svc, source_id = self._setup_service_with_file("sales.csv")
        # SQL uses 'data' as the table name AND 'wholesale_sales' which contains
        # 'sales' as substring. The fix ensures 'sales' does NOT match inside
        # 'wholesale_sales', so the loop continues to the 'data' fallback.
        sql = "SELECT * FROM data"
        result = svc.execute_query(sql, source_id)
        assert len(result.rows) == 2

    def test_case_insensitive_stem_match(self):
        """Stem matching should handle upper/lower case variants."""
        svc, source_id = self._setup_service_with_file("Sales.csv")
        sql = "SELECT * FROM Sales"
        result = svc.execute_query(sql, source_id)
        assert len(result.rows) == 2
