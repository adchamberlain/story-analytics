"""
DuckDB service for data ingestion, schema inspection, and query execution.
Manages in-memory DuckDB connections with uploaded data from CSV, parquet,
or Snowflake sources.
"""

import uuid
import csv
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass

import duckdb


DATA_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "snowflake_saas"


@dataclass
class SourceMeta:
    path: Path
    ingested_at: datetime


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
        self._sources: dict[str, SourceMeta] = {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._reload_uploaded_sources()

    def _reload_uploaded_sources(self) -> None:
        """Re-ingest all CSVs from data/uploads/ on startup.

        Each subdirectory name is the original source_id. This ensures charts
        that reference src_{source_id} tables survive server restarts.
        """
        if not DATA_DIR.exists():
            return

        count = 0
        for subdir in sorted(DATA_DIR.iterdir()):
            if not subdir.is_dir():
                continue
            source_id = subdir.name
            csv_file = next(subdir.glob("*.csv"), None)
            if not csv_file:
                continue

            table_name = f"src_{source_id}"
            try:
                delimiter = self._detect_delimiter(csv_file)
                self._conn.execute(f"""
                    CREATE OR REPLACE TABLE {table_name} AS
                    SELECT * FROM read_csv_auto('{csv_file}', delim='{delimiter}', header=true)
                """)
                self._sources[source_id] = SourceMeta(
                    path=csv_file,
                    ingested_at=datetime.fromtimestamp(csv_file.stat().st_mtime, tz=timezone.utc),
                )
                count += 1
            except (duckdb.Error, UnicodeDecodeError, ValueError) as e:
                print(f"[DuckDB] Skipping {source_id}/{csv_file.name}: {e}")

        if count:
            print(f"[DuckDB] Reloaded {count} CSV source(s) from disk")

    def ingest_csv(self, file_path: Path, filename: str, *, source_id: str | None = None) -> SourceSchema:
        """Load a CSV file into DuckDB and return schema information.

        If the initial parse fails (e.g. extra header/metadata lines), retries
        by skipping 1–5 leading rows before giving up.

        Pass an existing ``source_id`` to reuse it (e.g. when replacing a file).
        """
        source_id = source_id or uuid.uuid4().hex[:12]

        # Store file for persistence
        dest = DATA_DIR / source_id
        dest.mkdir(parents=True, exist_ok=True)
        stored_path = dest / filename
        if file_path != stored_path:
            import shutil
            shutil.copy2(file_path, stored_path)

        self._sources[source_id] = SourceMeta(path=stored_path, ingested_at=datetime.now(timezone.utc))
        table_name = f"src_{source_id}"

        # Detect delimiter
        delimiter = self._detect_delimiter(stored_path)

        # Try parsing, retrying with skip=N if the file has extra lines at the top
        first_error = None
        for skip in [0, 1, 2, 3, 4, 5]:
            try:
                skip_clause = f", skip={skip}" if skip > 0 else ""
                self._conn.execute(f"""
                    CREATE OR REPLACE TABLE {table_name} AS
                    SELECT * FROM read_csv_auto(
                        '{stored_path}', delim='{delimiter}', header=true{skip_clause}
                    )
                """)
                # Verify we got at least 1 column and 1 row
                row_count = self._conn.execute(
                    f"SELECT COUNT(*) FROM {table_name}"
                ).fetchone()[0]
                col_count = len(self._conn.execute(
                    f"DESCRIBE {table_name}"
                ).fetchall())
                if col_count >= 1 and row_count >= 1:
                    if skip > 0:
                        print(f"[DuckDB] Parsed {filename} after skipping {skip} leading line(s)")
                    break
            except (duckdb.Error, UnicodeDecodeError) as e:
                if first_error is None:
                    first_error = e
                continue
        else:
            # All attempts failed — clean up and raise a user-friendly message
            import shutil
            shutil.rmtree(dest, ignore_errors=True)
            del self._sources[source_id]
            raise ValueError(
                f"Could not parse \"{filename}\". "
                "Check that the file is a valid CSV with a header row."
            )

        # Get schema info
        schema = self._inspect_table(table_name, source_id, filename)
        return schema

    def ingest_parquet(self, parquet_path: Path, table_name_hint: str) -> SourceSchema:
        """Load a parquet file into DuckDB and return schema information."""
        source_id = uuid.uuid4().hex[:12]
        table_name = f"src_{source_id}"

        self._conn.execute(f"""
            CREATE OR REPLACE TABLE {table_name} AS
            SELECT * FROM read_parquet('{parquet_path}')
        """)

        self._sources[source_id] = SourceMeta(path=parquet_path, ingested_at=datetime.now(timezone.utc))
        schema = self._inspect_table(table_name, source_id, table_name_hint)
        return schema

    def ingest_from_snowflake(
        self,
        config: dict,
        credentials: dict,
        table_names: list[str],
        cache: bool = True,
    ) -> list[SourceSchema]:
        """Connect to Snowflake, fetch tables, load into DuckDB via parquet.

        Args:
            config: Connection config (account, warehouse, database, schema).
            credentials: Dict with 'username' and 'password'.
            table_names: Which tables to sync.
            cache: Whether to cache parquet files to data/snowflake_saas/.

        Returns:
            One SourceSchema per synced table.
        """
        import snowflake.connector
        import pyarrow as pa
        import pyarrow.parquet as pq

        from .connection_service import get_snowflake_pat

        connect_kwargs = {
            "account": config["account"],
            "user": credentials["username"],
            "warehouse": config.get("warehouse", ""),
            "database": config.get("database", ""),
            "schema": config.get("schema", ""),
        }
        pat = get_snowflake_pat()
        if pat:
            connect_kwargs["authenticator"] = "PROGRAMMATIC_ACCESS_TOKEN"
            connect_kwargs["token"] = pat
        elif credentials.get("password"):
            connect_kwargs["password"] = credentials["password"]
        else:
            raise RuntimeError(
                "No Snowflake auth available: no PAT found and no password provided. "
                "Set SNOWFLAKE_PAT in .env."
            )

        conn = snowflake.connector.connect(**connect_kwargs)

        results: list[SourceSchema] = []
        try:
            cursor = conn.cursor()
            for table in table_names:
                cursor.execute(f"SELECT * FROM {table}")
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()
                arrow_table = pa.table(
                    {col: [row[i] for row in rows] for i, col in enumerate(columns)}
                )

                # Write to temp parquet, then ingest
                if cache:
                    cache_subdir = CACHE_DIR / table.lower()
                    cache_subdir.mkdir(parents=True, exist_ok=True)
                    pq_path = cache_subdir / f"{table.lower()}.parquet"
                    pq.write_table(arrow_table, str(pq_path))
                else:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
                    pq_path = Path(tmp.name)
                    pq.write_table(arrow_table, str(pq_path))

                schema = self.ingest_parquet(pq_path, table.lower())
                results.append(schema)

                if not cache:
                    pq_path.unlink(missing_ok=True)

            cursor.close()
        finally:
            conn.close()

        return results

    def ingest_cached_parquet(self, cache_dir: Path | None = None) -> list[SourceSchema]:
        """Load all cached parquet files from data/snowflake_saas/ subdirectories.

        This is the offline fallback for environments without Snowflake credentials.
        """
        base = cache_dir or CACHE_DIR
        if not base.exists():
            return []

        results: list[SourceSchema] = []
        for subdir in sorted(base.iterdir()):
            if not subdir.is_dir():
                continue
            for pq_file in subdir.glob("*.parquet"):
                schema = self.ingest_parquet(pq_file, subdir.name)
                results.append(schema)
        return results

    def get_preview(self, source_id: str, limit: int = 10) -> QueryResult:
        """Get first N rows of an uploaded source."""
        table_name = f"src_{source_id}"
        return self.execute_query(f"SELECT * FROM {table_name} LIMIT {limit}", source_id)

    def execute_query(self, sql: str, source_id: str, params: dict[str, str | int | float] | None = None) -> QueryResult:
        """Execute a SQL query against an uploaded source's table.

        Args:
            sql: SQL query, optionally containing ${inputs.name} placeholders.
            source_id: The source to query against.
            params: Optional dict of filter param values to substitute for ${inputs.name}.
        """
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
                stem = self._sources[source_id].path.stem
                for ref in [stem, stem.lower(), stem.upper(), "data", "uploaded_data"]:
                    if ref in processed_sql:
                        processed_sql = processed_sql.replace(ref, table_name)
                        break
                else:
                    # No recognizable table reference found; if it's a simple query, wrap it
                    if "FROM" not in processed_sql.upper():
                        processed_sql = f"SELECT * FROM {table_name} LIMIT 100"

        # Substitute ${inputs.name} filter placeholders with parameterized values
        if params:
            processed_sql = self._substitute_filter_params(processed_sql, params)

        result = self._conn.execute(processed_sql)
        columns = [desc[0] for desc in result.description]
        rows_raw = result.fetchall()
        rows = [dict(zip(columns, row)) for row in rows_raw]

        return QueryResult(columns=columns, rows=rows, row_count=len(rows))

    def get_distinct_values(self, source_id: str, column: str, limit: int = 500) -> list[str]:
        """Get distinct values for a column, useful for dropdown filter options."""
        table_name = f"src_{source_id}"
        result = self._conn.execute(
            f"SELECT DISTINCT CAST({q(column)} AS VARCHAR) AS val "
            f"FROM {table_name} WHERE {q(column)} IS NOT NULL "
            f"ORDER BY val LIMIT {limit}"
        )
        return [row[0] for row in result.fetchall()]

    @staticmethod
    def _substitute_filter_params(sql: str, params: dict[str, str | int | float]) -> str:
        """Replace ${inputs.name} placeholders with escaped literal values.

        Uses DuckDB-safe string escaping (single-quote doubling) to prevent injection.
        """
        import re as _re
        def _replacer(match: _re.Match) -> str:
            name = match.group(1)
            if name not in params:
                return match.group(0)  # Leave unmatched placeholders as-is
            val = params[name]
            if isinstance(val, (int, float)):
                return str(val)
            # String: escape single quotes by doubling
            escaped = str(val).replace("'", "''")
            return f"'{escaped}'"

        return _re.sub(r'\$\{inputs\.(\w+)\}', _replacer, sql)

    def find_source_by_filename(self, filename: str) -> str | None:
        """Return the source_id of an existing source with this filename, or None."""
        for sid, meta in self._sources.items():
            if meta.path.name == filename:
                return sid
        return None

    def get_ingested_at(self, source_id: str) -> datetime | None:
        """Return the UTC timestamp when a source was ingested, or None."""
        meta = self._sources.get(source_id)
        return meta.ingested_at if meta else None

    def get_schema(self, source_id: str) -> SourceSchema:
        """Get schema information for an uploaded source."""
        table_name = f"src_{source_id}"
        meta = self._sources.get(source_id)
        filename = meta.path.name if meta else "unknown"
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
