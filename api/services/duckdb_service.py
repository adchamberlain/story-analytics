"""
DuckDB service for data ingestion, schema inspection, and query execution.
Manages in-memory DuckDB connections with uploaded data from CSV, parquet,
or Snowflake sources.
"""

import re
import uuid
import csv
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass

import duckdb

from api.services.storage import get_storage

# source_id values are 12-char hex strings from uuid4().hex[:12]
_SAFE_SOURCE_ID_RE = re.compile(r"^[a-f0-9]{12}$")


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
        self._lock = threading.RLock()
        self._sources: dict[str, SourceMeta] = {}
        self._storage = get_storage()
        # Ensure the uploads directory exists (storage.write() creates parents on demand)
        self._reload_uploaded_sources()

    def _reload_uploaded_sources(self) -> None:
        """Re-ingest all CSVs from uploads/ on startup.

        Each subdirectory name is the original source_id. This ensures charts
        that reference src_{source_id} tables survive server restarts.
        """
        all_files = self._storage.list("uploads")
        if not all_files:
            return

        # Group files by source_id subdirectory, pick only .csv files
        csv_by_source: dict[str, str] = {}  # source_id -> storage path
        for fpath in sorted(all_files):
            # fpath is like "uploads/<source_id>/file.csv"
            parts = fpath.split("/")
            if len(parts) < 3:
                continue
            source_id = parts[1]
            filename = parts[2]
            if not _SAFE_SOURCE_ID_RE.match(source_id):
                print(f"[DuckDB] Skipping unsafe source_id directory: {source_id!r}")
                continue
            if filename.lower().endswith(".csv") and source_id not in csv_by_source:
                csv_by_source[source_id] = fpath

        count = 0
        for source_id, storage_path in sorted(csv_by_source.items()):
            local_path = self._storage.get_local_path(storage_path)
            table_name = f"src_{source_id}"
            try:
                delimiter = self._detect_delimiter(local_path)
                with self._lock:
                    self._conn.execute(f"""
                        CREATE OR REPLACE TABLE {table_name} AS
                        SELECT * FROM read_csv_auto('{_sql_string(str(local_path))}', delim='{delimiter}', header=true)
                    """)
                self._sources[source_id] = SourceMeta(
                    path=local_path,
                    ingested_at=datetime.fromtimestamp(local_path.stat().st_mtime, tz=timezone.utc),
                )
                count += 1
            except (duckdb.Error, UnicodeDecodeError, ValueError) as e:
                print(f"[DuckDB] Skipping {source_id}/{local_path.name}: {e}")

        if count:
            print(f"[DuckDB] Reloaded {count} CSV source(s) from disk")

    def ingest_csv(self, file_path: Path, filename: str, *, source_id: str | None = None) -> SourceSchema:
        """Load a CSV file into DuckDB and return schema information.

        If the initial parse fails (e.g. extra header/metadata lines), retries
        by skipping 1–5 leading rows before giving up.

        Pass an existing ``source_id`` to reuse it (e.g. when replacing a file).
        """
        source_id = source_id or uuid.uuid4().hex[:12]

        # Store file for persistence — sanitize filename to prevent path traversal
        safe_filename = Path(filename).name
        if not safe_filename:
            safe_filename = "upload.csv"
        storage_key = f"uploads/{source_id}/{safe_filename}"
        # Write to storage first (so S3 has the file before get_local_path tries to read it)
        self._storage.write(storage_key, file_path.read_bytes())
        stored_path = self._storage.get_local_path(storage_key)

        table_name = f"src_{source_id}"

        # Detect delimiter
        delimiter = self._detect_delimiter(stored_path)

        # Try parsing, retrying with skip=N if the file has extra lines at the top
        first_error = None
        success = False
        try:
            for skip in [0, 1, 2, 3, 4, 5]:
                try:
                    skip_clause = f", skip={skip}" if skip > 0 else ""
                    with self._lock:
                        self._conn.execute(f"""
                            CREATE OR REPLACE TABLE {table_name} AS
                            SELECT * FROM read_csv_auto(
                                '{_sql_string(str(stored_path))}', delim='{delimiter}', header=true{skip_clause}
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
                        success = True
                        break
                except (duckdb.Error, UnicodeDecodeError) as e:
                    if first_error is None:
                        first_error = e
                    continue
        except BaseException:
            # Unexpected error (OSError, MemoryError, etc.) — clean up files and table
            self._storage.delete_tree(f"uploads/{source_id}")
            try:
                with self._lock:
                    self._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            raise

        if not success:
            # All attempts failed — clean up and raise a user-friendly message
            self._storage.delete_tree(f"uploads/{source_id}")
            try:
                with self._lock:
                    self._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            raise ValueError(
                f"Could not parse \"{filename}\". "
                "Check that the file is a valid CSV with a header row."
            )

        # Register source only after successful table creation
        self._sources[source_id] = SourceMeta(path=stored_path, ingested_at=datetime.now(timezone.utc))

        # Get schema info
        schema = self._inspect_table(table_name, source_id, filename)
        return schema

    def ingest_parquet(self, parquet_path: Path, table_name_hint: str, *, source_id: str | None = None) -> SourceSchema:
        """Load a parquet file into DuckDB and return schema information.

        Pass an existing ``source_id`` to reuse it (e.g. when re-syncing from Snowflake).
        """
        source_id = source_id or uuid.uuid4().hex[:12]
        table_name = f"src_{source_id}"

        try:
            with self._lock:
                self._conn.execute(f"""
                    CREATE OR REPLACE TABLE {table_name} AS
                    SELECT * FROM read_parquet('{_sql_string(str(parquet_path))}')
                """)
            # Store a clean synthetic path based on the friendly name (the temp
            # file is deleted immediately after ingest, so its path is useless).
            # Deduplicate: if "orders.parquet" exists, try "orders_2.parquet", etc.
            clean_stem = re.sub(r'[^\w\s-]', '', table_name_hint).strip().replace(' ', '_') or 'query_result'
            candidate = f"{clean_stem}.parquet"
            existing_names = {m.path.name for sid, m in self._sources.items() if sid != source_id}
            if candidate in existing_names:
                n = 2
                while f"{clean_stem}_{n}.parquet" in existing_names:
                    n += 1
                candidate = f"{clean_stem}_{n}.parquet"
            self._sources[source_id] = SourceMeta(path=Path(candidate), ingested_at=datetime.now(timezone.utc))
            schema = self._inspect_table(table_name, source_id, candidate)
            return schema
        except Exception:
            self._sources.pop(source_id, None)
            try:
                with self._lock:
                    self._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            raise

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
            cache: Whether to cache parquet files to snowflake_saas/.

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
                # Quote table name to prevent SQL injection
                quoted_table = '"' + table.replace('"', '""') + '"'
                cursor.execute(f"SELECT * FROM {quoted_table}")
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()
                arrow_table = pa.table(
                    {col: [row[i] for row in rows] for i, col in enumerate(columns)}
                )

                # Write to temp parquet, then ingest
                if cache:
                    cache_key = f"snowflake_saas/{table.lower()}/{table.lower()}.parquet"
                    pq_path = self._storage.get_local_path(cache_key)
                    pq_path.parent.mkdir(parents=True, exist_ok=True)
                    pq.write_table(arrow_table, str(pq_path))
                else:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
                    pq_path = Path(tmp.name)
                    tmp.close()  # Close file handle; we only need the path
                    pq.write_table(arrow_table, str(pq_path))

                # Reuse the old source_id when re-syncing so existing charts keep working
                existing_id = self.find_source_by_filename(table.lower())
                schema = self.ingest_parquet(pq_path, table.lower(), source_id=existing_id)
                results.append(schema)

                if not cache:
                    pq_path.unlink(missing_ok=True)

            cursor.close()
        finally:
            conn.close()

        return results

    def ingest_cached_parquet(self, cache_dir: Path | None = None) -> list[SourceSchema]:
        """Load all cached parquet files from snowflake_saas/ subdirectories.

        This is the offline fallback for environments without Snowflake credentials.
        """
        if cache_dir:
            # Explicit path override (used in tests) — use direct filesystem access
            if not cache_dir.exists():
                return []
            results: list[SourceSchema] = []
            for subdir in sorted(cache_dir.iterdir()):
                if not subdir.is_dir():
                    continue
                for pq_file in subdir.glob("*.parquet"):
                    existing_id = self.find_source_by_filename(subdir.name)
                    schema = self.ingest_parquet(pq_file, subdir.name, source_id=existing_id)
                    results.append(schema)
            return results

        # Default: use storage backend
        all_files = self._storage.list("snowflake_saas")
        if not all_files:
            return []

        # Group parquet files by subdirectory
        pq_by_subdir: dict[str, str] = {}  # subdir_name -> storage path
        for fpath in sorted(all_files):
            parts = fpath.split("/")
            if len(parts) < 3:
                continue
            subdir_name = parts[1]
            filename = parts[2]
            if filename.lower().endswith(".parquet") and subdir_name not in pq_by_subdir:
                pq_by_subdir[subdir_name] = fpath

        results = []
        for subdir_name, storage_path in sorted(pq_by_subdir.items()):
            local_path = self._storage.get_local_path(storage_path)
            existing_id = self.find_source_by_filename(subdir_name)
            schema = self.ingest_parquet(local_path, subdir_name, source_id=existing_id)
            results.append(schema)
        return results

    def get_preview(self, source_id: str, limit: int = 10) -> QueryResult:
        """Get first N rows of an uploaded source."""
        if not _SAFE_SOURCE_ID_RE.match(source_id):
            raise ValueError(f"Invalid source_id: {source_id}")
        table_name = f"src_{source_id}"
        return self.execute_query(f"SELECT * FROM {table_name} LIMIT {limit}", source_id)

    def reload_source(self, source_id: str) -> None:
        """Re-create a DuckDB table from the CSV in storage (without re-uploading).

        Used after transforms modify the CSV in-place so the DuckDB table
        reflects the updated file without overwriting it with a stale local cache.
        """
        if not _SAFE_SOURCE_ID_RE.match(source_id):
            raise ValueError(f"Invalid source_id: {source_id}")

        # Find the CSV in storage
        prefix = f"uploads/{source_id}/"
        all_files = self._storage.list(prefix)
        csv_path = next(
            (f for f in all_files if f.lower().endswith(".csv")), None
        )
        if not csv_path:
            raise FileNotFoundError(f"No CSV found for source {source_id}")

        # Invalidate stale local cache so S3 backend re-downloads the updated file
        self._storage.invalidate_local_cache(csv_path)
        local_path = self._storage.get_local_path(csv_path)
        table_name = f"src_{source_id}"
        delimiter = self._detect_delimiter(local_path)
        with self._lock:
            self._conn.execute(f"""
                CREATE OR REPLACE TABLE {table_name} AS
                SELECT * FROM read_csv_auto(
                    '{_sql_string(str(local_path))}', delim='{delimiter}', header=true
                )
            """)
        self._sources[source_id] = SourceMeta(
            path=local_path,
            ingested_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _is_read_only_sql(sql: str) -> bool:
        """Check whether *sql* is a read-only statement (SELECT / WITH / EXPLAIN).

        Strips leading SQL comments before inspecting the first keyword so that
        ``-- comment\\nDROP TABLE …`` cannot bypass the check.
        """
        stripped = re.sub(
            r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=re.DOTALL,
        )
        m = re.match(r'\s*(\w+)', stripped)
        return bool(m) and m.group(1).upper() in ("SELECT", "WITH", "EXPLAIN")

    def execute_query(self, sql: str, source_id: str, params: dict[str, str | int | float] | None = None) -> QueryResult:
        """Execute a SQL query against an uploaded source's table.

        Args:
            sql: SQL query, optionally containing ${inputs.name} placeholders.
            source_id: The source to query against.
            params: Optional dict of filter param values to substitute for ${inputs.name}.
        """
        if not _SAFE_SOURCE_ID_RE.match(source_id):
            raise ValueError(f"Invalid source_id: {source_id}")

        # Enforce read-only: only SELECT / WITH / EXPLAIN are allowed
        if not self._is_read_only_sql(sql):
            raise ValueError("Only SELECT, WITH, and EXPLAIN statements are allowed.")

        # Strip semicolons to prevent piggy-backed DML
        sql = sql.replace(";", "")

        table_name = f"src_{source_id}"

        # Replace generic table references with the actual table name
        # The LLM will generate SQL referencing "data" or the filename
        processed_sql = sql

        # If the SQL doesn't reference our internal table name, wrap it
        if table_name not in processed_sql:
            # Try to find what table the SQL references and substitute
            # Common patterns: FROM data, FROM "data", FROM table_name
            meta = self._sources.get(source_id)
            if meta:
                # Get the stem of the original filename as a possible table reference
                stem = meta.path.stem
                for ref in [stem, stem.lower(), stem.upper(), "data", "uploaded_data"]:
                    # Only replace table references after FROM/JOIN keywords to avoid
                    # corrupting column aliases, CTEs, or string literals that share the name.
                    pattern = r'(?i)(\b(?:FROM|JOIN)\b\s+)' + re.escape(ref) + r'\b'
                    if re.search(pattern, processed_sql):
                        processed_sql = re.sub(
                            pattern,
                            lambda m: m.group(1) + table_name,
                            processed_sql,
                        )
                        break
                else:
                    # No recognizable table reference found; if it's a simple query, wrap it
                    if "FROM" not in processed_sql.upper():
                        processed_sql = f"SELECT * FROM {table_name} LIMIT 100"

        # Substitute ${inputs.name} filter placeholders with parameterized values
        if params:
            processed_sql = self._substitute_filter_params(processed_sql, params)

        with self._lock:
            result = self._conn.execute(processed_sql)
            if result.description is None:
                return QueryResult(columns=[], rows=[], row_count=0)
            columns = [desc[0] for desc in result.description]
            rows_raw = result.fetchall()
        rows = [dict(zip(columns, row)) for row in rows_raw]

        return QueryResult(columns=columns, rows=rows, row_count=len(rows))

    def get_distinct_values(self, source_id: str, column: str, limit: int = 500) -> list[str]:
        """Get distinct values for a column, useful for dropdown filter options."""
        if not _SAFE_SOURCE_ID_RE.match(source_id):
            raise ValueError(f"Invalid source_id: {source_id}")
        limit = max(1, min(limit, 10_000))  # Clamp to prevent DoS
        table_name = f"src_{source_id}"
        with self._lock:
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
            # Bool check must come before int (bool is a subclass of int in Python)
            if isinstance(val, bool):
                return "true" if val else "false"
            if isinstance(val, (int, float)):
                return str(val)
            # String: escape single quotes by doubling
            escaped = str(val).replace("'", "''")
            return f"'{escaped}'"

        return _re.sub(r'\$\{inputs\.(\w+)\}', _replacer, sql)

    def find_source_by_filename(self, filename: str) -> str | None:
        """Return the source_id of an existing source with this filename, or None.

        Matches against both the full filename (e.g. ``sales.csv``) and the
        stem without extension (e.g. ``orders`` matching ``orders.parquet``).
        """
        for sid, meta in self._sources.items():
            if meta.path.name == filename or meta.path.stem == filename:
                return sid
        return None

    def is_csv_source(self, source_id: str) -> bool:
        """Return True if the source is an uploaded CSV (static data)."""
        return source_id in self._sources

    def get_ingested_at(self, source_id: str) -> datetime | None:
        """Return the UTC timestamp when a source was ingested, or None."""
        meta = self._sources.get(source_id)
        return meta.ingested_at if meta else None

    def get_schema(self, source_id: str) -> SourceSchema:
        """Get schema information for an uploaded source."""
        if not _SAFE_SOURCE_ID_RE.match(source_id):
            raise ValueError(f"Invalid source_id: {source_id}")
        table_name = f"src_{source_id}"
        meta = self._sources.get(source_id)
        filename = meta.path.name if meta else "unknown"
        return self._inspect_table(table_name, source_id, filename)

    def _inspect_table(self, table_name: str, source_id: str, filename: str) -> SourceSchema:
        """Inspect a DuckDB table and return schema info."""
        with self._lock:
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
                            f"SELECT CAST(MIN({q(col_name)}) AS VARCHAR), CAST(MAX({q(col_name)}) AS VARCHAR) FROM {table_name}"
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
        """Auto-detect CSV delimiter.

        The returned delimiter is escaped for safe use in SQL strings
        (single quotes doubled).
        """
        with open(path, 'r', newline='', encoding='utf-8', errors='replace') as f:
            sample = f.read(8192)
        _SAFE_DELIMITERS = {',', '\t', '|', ';', ' ', ':'}
        try:
            dialect = csv.Sniffer().sniff(sample)
            delim = dialect.delimiter
        except csv.Error:
            delim = ','
        # Only allow known-safe delimiters to prevent SQL injection via crafted CSVs
        if delim not in _SAFE_DELIMITERS:
            delim = ','
        # Escape single quotes to prevent SQL injection when interpolated
        return delim.replace("'", "''")


def q(col_name: str) -> str:
    """Quote a column name for DuckDB SQL.

    Escapes embedded double quotes by doubling them, per SQL standard.
    """
    escaped = col_name.replace('"', '""')
    return f'"{escaped}"'


def _sql_string(value: str) -> str:
    """Escape a value for use inside a SQL single-quoted string literal.

    Doubles any embedded single quotes to prevent SQL injection.
    """
    return value.replace("'", "''")


# ── Singleton ────────────────────────────────────────────────────────────────

_service: DuckDBService | None = None
_service_lock = threading.Lock()


def get_duckdb_service() -> DuckDBService:
    global _service
    if _service is None:
        with _service_lock:
            if _service is None:
                _service = DuckDBService()
    return _service
