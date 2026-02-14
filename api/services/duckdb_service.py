"""
DuckDB service for CSV ingestion, schema inspection, and query execution.
Manages in-memory DuckDB connections with uploaded CSV data.
"""

import uuid
import csv
from pathlib import Path
from dataclasses import dataclass, field

import duckdb


DATA_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"


@dataclass
class ColumnInfo:
    name: str
    type: str
    nullable: bool
    sample_values: list[str]
    null_count: int
    distinct_count: int
    min_value: str | None = None
    max_value: str | None = None


@dataclass
class SourceSchema:
    source_id: str
    filename: str
    row_count: int
    columns: list[ColumnInfo]


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[dict]
    row_count: int


class DuckDBService:
    """Manages CSV uploads and queries via DuckDB."""

    def __init__(self) -> None:
        self._conn = duckdb.connect(":memory:")
        self._sources: dict[str, Path] = {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def ingest_csv(self, file_path: Path, filename: str) -> SourceSchema:
        """Load a CSV file into DuckDB and return schema information."""
        source_id = uuid.uuid4().hex[:12]

        # Store file for persistence
        dest = DATA_DIR / source_id
        dest.mkdir(parents=True, exist_ok=True)
        stored_path = dest / filename
        if file_path != stored_path:
            import shutil
            shutil.copy2(file_path, stored_path)

        self._sources[source_id] = stored_path
        table_name = f"src_{source_id}"

        # Detect delimiter
        delimiter = self._detect_delimiter(stored_path)

        # Create table from CSV
        self._conn.execute(f"""
            CREATE OR REPLACE TABLE {table_name} AS
            SELECT * FROM read_csv_auto('{stored_path}', delim='{delimiter}', header=true)
        """)

        # Get schema info
        schema = self._inspect_table(table_name, source_id, filename)
        return schema

    def get_preview(self, source_id: str, limit: int = 10) -> QueryResult:
        """Get first N rows of an uploaded source."""
        table_name = f"src_{source_id}"
        return self.execute_query(f"SELECT * FROM {table_name} LIMIT {limit}", source_id)

    def execute_query(self, sql: str, source_id: str) -> QueryResult:
        """Execute a SQL query against an uploaded source's table."""
        table_name = f"src_{source_id}"

        # Replace generic table references with the actual table name
        # The LLM will generate SQL referencing "data" or the filename
        processed_sql = sql

        # If the SQL doesn't reference our internal table name, wrap it
        if table_name not in processed_sql:
            # Try to find what table the SQL references and substitute
            # Common patterns: FROM data, FROM "data", FROM table_name
            if source_id in self._sources:
                # Get the stem of the original filename as a possible table reference
                stem = self._sources[source_id].stem
                for ref in [stem, stem.lower(), stem.upper(), "data", "uploaded_data"]:
                    if ref in processed_sql:
                        processed_sql = processed_sql.replace(ref, table_name)
                        break
                else:
                    # No recognizable table reference found; if it's a simple query, wrap it
                    if "FROM" not in processed_sql.upper():
                        processed_sql = f"SELECT * FROM {table_name} LIMIT 100"

        result = self._conn.execute(processed_sql)
        columns = [desc[0] for desc in result.description]
        rows_raw = result.fetchall()
        rows = [dict(zip(columns, row)) for row in rows_raw]

        return QueryResult(columns=columns, rows=rows, row_count=len(rows))

    def get_schema(self, source_id: str) -> SourceSchema:
        """Get schema information for an uploaded source."""
        table_name = f"src_{source_id}"
        filename = self._sources.get(source_id, Path("unknown")).name
        return self._inspect_table(table_name, source_id, filename)

    def _inspect_table(self, table_name: str, source_id: str, filename: str) -> SourceSchema:
        """Inspect a DuckDB table and return schema info."""
        # Get column types
        desc = self._conn.execute(f"DESCRIBE {table_name}").fetchall()

        # Get row count
        row_count = self._conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

        columns: list[ColumnInfo] = []
        for col_name, col_type, *_ in desc:
            # Sample values
            samples = self._conn.execute(
                f"SELECT DISTINCT CAST({q(col_name)} AS VARCHAR) FROM {table_name} "
                f"WHERE {q(col_name)} IS NOT NULL LIMIT 5"
            ).fetchall()
            sample_values = [str(s[0]) for s in samples]

            # Null count
            null_count = self._conn.execute(
                f"SELECT COUNT(*) FROM {table_name} WHERE {q(col_name)} IS NULL"
            ).fetchone()[0]

            # Distinct count
            distinct_count = self._conn.execute(
                f"SELECT COUNT(DISTINCT {q(col_name)}) FROM {table_name}"
            ).fetchone()[0]

            # Min/max for numeric and date types
            min_val = max_val = None
            if any(t in col_type.upper() for t in ['INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'DATE', 'TIMESTAMP']):
                try:
                    minmax = self._conn.execute(
                        f"SELECT MIN(CAST({q(col_name)} AS VARCHAR)), MAX(CAST({q(col_name)} AS VARCHAR)) FROM {table_name}"
                    ).fetchone()
                    min_val, max_val = minmax[0], minmax[1]
                except duckdb.Error:
                    pass

            columns.append(ColumnInfo(
                name=col_name,
                type=col_type,
                nullable=null_count > 0,
                sample_values=sample_values,
                null_count=null_count,
                distinct_count=distinct_count,
                min_value=min_val,
                max_value=max_val,
            ))

        return SourceSchema(
            source_id=source_id,
            filename=filename,
            row_count=row_count,
            columns=columns,
        )

    def _detect_delimiter(self, path: Path) -> str:
        """Auto-detect CSV delimiter."""
        with open(path, 'r', newline='') as f:
            sample = f.read(8192)
        try:
            dialect = csv.Sniffer().sniff(sample)
            return dialect.delimiter
        except csv.Error:
            return ','


def q(col_name: str) -> str:
    """Quote a column name for DuckDB SQL."""
    return f'"{col_name}"'


# ── Singleton ────────────────────────────────────────────────────────────────

_service: DuckDBService | None = None


def get_duckdb_service() -> DuckDBService:
    global _service
    if _service is None:
        _service = DuckDBService()
    return _service
