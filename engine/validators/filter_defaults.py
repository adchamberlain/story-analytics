"""
Filter Default Resolvers - Ensures filters have sensible default values.

Filters without default values cause ${inputs.xxx} to be undefined on first
page load, resulting in SQL errors or blank charts. These resolvers:
1. Query dropdown options to set first value as default
2. Extract DateRange defaults from user request text
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional

import duckdb

if TYPE_CHECKING:
    from ..models.chart import FilterSpec, FilterType


class FilterDefaultResolver:
    """Resolves default values for filters when not specified."""

    @classmethod
    def get_data_dir(cls) -> str:
        """Get the path to the data directory for parquet files."""
        base_dir = Path(__file__).parent.parent.parent
        data_dir = base_dir / "data"
        return str(data_dir)

    @classmethod
    def resolve_dropdown_default(
        cls,
        filter_spec: "FilterSpec",
        db_path: Optional[str] = None,
    ) -> "FilterSpec":
        """
        Query options and set first value as default if none specified.

        Without a default value, the Dropdown's ${inputs.filter_name} is
        undefined on first page load, causing the main query to fail.

        Args:
            filter_spec: The FilterSpec to resolve
            db_path: Optional path to DuckDB database (or data directory)

        Returns:
            FilterSpec with default_value set if it was missing
        """
        if filter_spec.default_value:
            return filter_spec  # Already has default

        if not filter_spec.options_query:
            return filter_spec  # No query to execute

        if not filter_spec.options_column:
            return filter_spec  # Don't know which column to use

        if db_path is None:
            db_path = cls.get_data_dir()

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

            result = con.execute(filter_spec.options_query).fetchdf()

            if not result.empty and filter_spec.options_column in result.columns:
                # Use first value as default
                first_value = result[filter_spec.options_column].iloc[0]
                filter_spec.default_value = str(first_value)
                print(f"[FilterDefaultResolver] Set default for {filter_spec.name}: {filter_spec.default_value}")
        except Exception as e:
            print(f"[FilterDefaultResolver] Could not resolve default for {filter_spec.name}: {e}")
        finally:
            if "con" in locals():
                con.close()

        return filter_spec


class DateRangeDefaultExtractor:
    """Extracts appropriate DateRange defaults from user request."""

    # Map preset names to patterns that indicate them
    PATTERNS = {
        "Last 7 Days": ["last 7 days", "past 7 days", "past week", "last week"],
        "Last 30 Days": ["last 30 days", "past 30 days", "last month", "past month"],
        "Last 90 Days": ["last 90 days", "past 90 days", "last 3 months", "past 3 months", "last quarter"],
        "Last 6 Months": ["last 6 months", "past 6 months", "6 months", "half year"],
        "Last 12 Months": ["last 12 months", "past 12 months", "last year", "past year", "12 months"],
        "Year to Date": ["year to date", "ytd", "this year"],
    }

    @classmethod
    def extract_default(cls, user_request: str) -> str:
        """
        Extract the appropriate default preset from user request.

        Args:
            user_request: The original user request text

        Returns:
            The most appropriate preset name, or "Last 12 Months" as fallback
        """
        request_lower = user_request.lower()

        # Check patterns in order of specificity (shorter periods first)
        for preset, patterns in cls.PATTERNS.items():
            for pattern in patterns:
                if pattern in request_lower:
                    return preset

        return "Last 12 Months"  # Fallback

    @classmethod
    def correct_filter(
        cls,
        filter_spec: "FilterSpec",
        original_request: str,
    ) -> "FilterSpec":
        """
        Correct DateRange filter default based on original request.

        The LLM is supposed to extract the time period from the request
        and set default_value appropriately, but doesn't always do so.
        This validator provides a deterministic fallback.

        Args:
            filter_spec: The FilterSpec to correct
            original_request: The original user request

        Returns:
            FilterSpec with corrected default_value if applicable
        """
        from ..models.chart import FilterType

        if filter_spec.filter_type != FilterType.DATE_RANGE:
            return filter_spec

        # Extract what the user actually requested
        extracted = cls.extract_default(original_request)

        # Only correct if LLM used the generic default
        if filter_spec.default_value is None or filter_spec.default_value == "Last 12 Months":
            if extracted != "Last 12 Months":
                print(f"[DateRangeDefaultExtractor] Corrected default: {filter_spec.default_value} -> {extracted}")
                filter_spec.default_value = extracted

        return filter_spec
