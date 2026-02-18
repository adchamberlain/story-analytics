"""
Schema analyzer: converts DuckDB column metadata into a concise LLM prompt context.

The goal is to give the LLM enough information about the data to propose
a good chart — column names, types, sample values, distributions, and row count —
without dumping raw data.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ColumnProfile:
    """Profile of a single column for LLM context."""
    name: str
    type: str
    sample_values: list[str]
    distinct_count: int
    null_count: int
    min_value: str | None = None
    max_value: str | None = None


@dataclass
class DataProfile:
    """Complete profile of an uploaded dataset."""
    filename: str
    row_count: int
    columns: list[ColumnProfile]

    @classmethod
    def from_schema_response(cls, schema: dict) -> DataProfile:
        """Create from the /api/data/upload response dict."""
        return cls(
            filename=schema["filename"],
            row_count=schema["row_count"],
            columns=[
                ColumnProfile(
                    name=c["name"],
                    type=c["type"],
                    sample_values=c.get("sample_values", []),
                    distinct_count=c.get("distinct_count", 0),
                    null_count=c.get("null_count", 0),
                    min_value=c.get("min_value"),
                    max_value=c.get("max_value"),
                )
                for c in schema["columns"]
            ],
        )


def build_schema_context(profile: DataProfile, table_name: str) -> str:
    """
    Build a concise schema description for LLM prompts.

    Args:
        profile: The data profile from schema analysis
        table_name: The DuckDB table name (e.g., "src_abc123")

    Returns:
        A formatted string suitable for injection into an LLM system prompt.
    """
    lines = [
        f"TABLE: {table_name}",
        f"Source file: {profile.filename}",
        f"Row count: {profile.row_count:,}",
        "",
        "COLUMNS:",
    ]

    for col in profile.columns:
        type_label = _simplify_type(col.type)
        parts = [f"  - {col.name} ({type_label})"]

        # Add sample values (up to 5)
        if col.sample_values:
            samples = ", ".join(col.sample_values[:5])
            parts.append(f"    samples: {samples}")

        # Add stats
        stats = []
        stats.append(f"{col.distinct_count} distinct")
        if col.null_count > 0:
            stats.append(f"{col.null_count} nulls")
        if col.min_value is not None and col.max_value is not None:
            stats.append(f"range: {col.min_value} → {col.max_value}")
        parts.append(f"    {', '.join(stats)}")

        lines.append("\n".join(parts))

    # Add data shape hints
    lines.append("")
    lines.append("DATA SHAPE HINTS:")

    date_cols = [c for c in profile.columns if _is_date_type(c.type)]
    numeric_cols = [c for c in profile.columns if _is_numeric_type(c.type)]
    categorical_cols = [c for c in profile.columns
                        if not _is_date_type(c.type)
                        and not _is_numeric_type(c.type)
                        and c.distinct_count <= 50]

    if date_cols:
        lines.append(f"  Date columns: {', '.join(c.name for c in date_cols)}")
    if numeric_cols:
        lines.append(f"  Numeric columns: {', '.join(c.name for c in numeric_cols)}")
    if categorical_cols:
        lines.append(f"  Categorical columns: {', '.join(c.name for c in categorical_cols)}")

    # Suggest chart types based on data shape
    lines.append("")
    lines.append("DATA PATTERN:")
    if date_cols and numeric_cols:
        lines.append("  Time series data detected (date + numeric columns → line or area chart)")
    elif categorical_cols and numeric_cols:
        lines.append("  Category + metric data detected (→ bar chart)")
    elif len(numeric_cols) >= 2:
        lines.append("  Multiple numeric columns without dates (→ scatter plot)")

    return "\n".join(lines)


def _simplify_type(duckdb_type: str) -> str:
    """Simplify DuckDB type names for LLM readability."""
    t = duckdb_type.upper()
    if "INT" in t:
        return "integer"
    if "FLOAT" in t or "DOUBLE" in t or "DECIMAL" in t or "NUMERIC" in t:
        return "decimal"
    if "DATE" in t and "TIME" not in t:
        return "date"
    if "TIMESTAMP" in t:
        return "datetime"
    if "BOOL" in t:
        return "boolean"
    if "VARCHAR" in t or "TEXT" in t or "CHAR" in t:
        return "text"
    return duckdb_type.lower()


def _is_date_type(duckdb_type: str) -> bool:
    t = duckdb_type.upper()
    return "DATE" in t or "TIMESTAMP" in t


def _is_numeric_type(duckdb_type: str) -> bool:
    t = duckdb_type.upper()
    return any(x in t for x in ["INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"])
