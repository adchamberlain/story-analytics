"""
Scale Analyzer - Detects when multi-metric charts need dual y-axes.

When a chart has two metrics with vastly different scales (e.g., revenue ~100k
vs count ~100), displaying them on the same y-axis makes one metric invisible.
This analyzer samples the data to detect scale mismatches and recommends
using y + y2 (dual y-axis) configuration.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import duckdb


@dataclass
class ScaleAnalysis:
    """Results of scale analysis for multi-metric charts."""

    column1: str
    column2: str
    max1: float
    max2: float
    scale_ratio: float  # How much larger is the bigger metric
    needs_dual_axis: bool
    primary_column: str  # Column for y (larger scale)
    secondary_column: str  # Column for y2 (smaller scale)


class ScaleAnalyzer:
    """Analyzes metric scales to determine if dual y-axis is needed."""

    # If one metric is 10x+ larger than another, use dual axis
    SCALE_RATIO_THRESHOLD = 10.0

    @classmethod
    def get_db_path(cls) -> str:
        """Get the path to the Evidence data directory for parquet files."""
        base_dir = Path(__file__).parent.parent.parent
        data_dir = base_dir / ".evidence" / "template" / "static" / "data"
        return str(data_dir)

    @classmethod
    def analyze(
        cls,
        sql: str,
        columns: list[str],
        db_path: Optional[str] = None,
    ) -> Optional[ScaleAnalysis]:
        """
        Execute query and analyze scale differences between metrics.

        Only analyzes if exactly 2 numeric metric columns are present
        (first column assumed to be x-axis dimension).

        Args:
            sql: The SQL query to sample
            columns: Column names from the query
            db_path: Optional path to DuckDB database

        Returns:
            ScaleAnalysis if applicable, None otherwise
        """
        if len(columns) < 3:  # Need x + at least 2 y columns
            return None

        y_columns = columns[1:]  # Skip x-axis column
        if len(y_columns) != 2:
            return None  # Only analyze 2-metric charts

        if db_path is None:
            db_path = cls.get_db_path()

        # Replace template variables for analysis
        test_sql = cls._replace_template_variables(sql)

        try:
            # Use in-memory DuckDB with parquet files
            con = duckdb.connect()

            # Register parquet files as views to match Evidence's table names
            data_dir = Path(db_path)
            schemas_created = set()

            if data_dir.exists():
                for source_dir in data_dir.iterdir():
                    if source_dir.is_dir():
                        schema_name = source_dir.name
                        # Create schema if not exists
                        if schema_name not in schemas_created:
                            con.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name}")
                            schemas_created.add(schema_name)

                        for parquet_dir in source_dir.iterdir():
                            if parquet_dir.is_dir():
                                parquet_files = list(parquet_dir.glob("*.parquet"))
                                if parquet_files:
                                    # Create table in schema
                                    table_name = parquet_dir.name
                                    parquet_path = str(parquet_files[0])
                                    con.execute(f"CREATE VIEW {schema_name}.{table_name} AS SELECT * FROM read_parquet('{parquet_path}')")

            result = con.execute(test_sql).fetchdf()

            if result.empty:
                return None

            # Check if columns exist in result
            if y_columns[0] not in result.columns or y_columns[1] not in result.columns:
                return None

            # Get max absolute values for each metric column
            try:
                max1 = abs(result[y_columns[0]].max())
                max2 = abs(result[y_columns[1]].max())
            except (TypeError, ValueError):
                # Columns might not be numeric
                return None

            if max1 == 0 or max2 == 0 or max1 is None or max2 is None:
                return None

            scale_ratio = max(max1 / max2, max2 / max1)
            needs_dual = scale_ratio >= cls.SCALE_RATIO_THRESHOLD

            # Put larger scale on primary y-axis
            if max1 >= max2:
                primary, secondary = y_columns[0], y_columns[1]
            else:
                primary, secondary = y_columns[1], y_columns[0]

            return ScaleAnalysis(
                column1=y_columns[0],
                column2=y_columns[1],
                max1=float(max1),
                max2=float(max2),
                scale_ratio=scale_ratio,
                needs_dual_axis=needs_dual,
                primary_column=primary,
                secondary_column=secondary,
            )
        except Exception as e:
            print(f"[ScaleAnalyzer] Analysis failed: {e}")
            return None
        finally:
            if "con" in locals():
                con.close()

    @classmethod
    def _replace_template_variables(cls, sql: str) -> str:
        """
        Replace Evidence template variables with test values.

        Args:
            sql: SQL with ${inputs.xxx} variables

        Returns:
            SQL with variables replaced for testing
        """
        import re

        # Replace date range inputs
        sql = re.sub(
            r"\$\{inputs\.(\w+)\.start\}",
            "'2024-01-01'",
            sql,
        )
        sql = re.sub(
            r"\$\{inputs\.(\w+)\.end\}",
            "'2025-12-31'",
            sql,
        )

        # Replace dropdown column access patterns (year is numeric)
        sql = re.sub(
            r"\$\{inputs\.(\w+)\.year\}",
            "2024",
            sql,
        )
        # Other column access patterns
        sql = re.sub(
            r"\$\{inputs\.(\w+)\.(\w+)\}",
            "'placeholder'",
            sql,
        )

        # Replace string inputs
        sql = re.sub(
            r"'\$\{inputs\.(\w+)\}'",
            "'placeholder'",
            sql,
        )

        # Replace numeric inputs
        sql = re.sub(
            r"\$\{inputs\.(\w+)\}",
            "0",
            sql,
        )

        return sql
