"""
Regression test: table name substitution must only replace after FROM/JOIN.

Bug: The global `re.sub(r'\\bstem\\b', table_name, sql)` replaced every
word-boundary occurrence of the filename stem — including in column aliases,
SELECT expressions, and string literals. E.g., `SUM(sales) AS sales FROM sales`
would corrupt column references.
Fix: Replaced with a FROM/JOIN-aware regex that only substitutes table references
in structural SQL positions.
"""

import csv
import tempfile
from pathlib import Path

import pytest

from api.services.duckdb_service import DuckDBService


@pytest.mark.unit
class TestTableSubFromJoin:
    def _setup(self, filename: str) -> tuple[DuckDBService, str]:
        svc = DuckDBService()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w")
        writer = csv.writer(tmp)
        writer.writerow(["id", "sales", "region"])
        writer.writerow([1, 100, "East"])
        writer.writerow([2, 200, "West"])
        tmp.close()
        schema = svc.ingest_csv(Path(tmp.name), filename)
        return svc, schema.source_id

    def test_column_alias_not_corrupted(self):
        """A column named 'sales' should NOT be replaced when the file is 'sales.csv'."""
        svc, source_id = self._setup("sales.csv")
        # SQL uses 'sales' as both a column name and the table name
        sql = "SELECT SUM(sales) AS total_sales FROM sales"
        result = svc.execute_query(sql, source_id)
        # Should successfully execute — 'sales' column preserved, only FROM sales replaced
        assert len(result.rows) == 1
        assert result.rows[0]["total_sales"] == 300

    def test_from_clause_replaced(self):
        """The table name after FROM should be replaced."""
        svc, source_id = self._setup("sales.csv")
        sql = "SELECT * FROM sales"
        result = svc.execute_query(sql, source_id)
        assert len(result.rows) == 2

    def test_join_clause_replaced(self):
        """The table name after JOIN should be replaced."""
        svc, source_id = self._setup("sales.csv")
        sql = "SELECT a.* FROM sales a JOIN sales b ON a.id = b.id"
        result = svc.execute_query(sql, source_id)
        assert len(result.rows) == 2
