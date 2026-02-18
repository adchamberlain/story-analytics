"""
Snowflake connector: sync tables from Snowflake into DuckDB via parquet.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .base import DatabaseConnector, ColumnInfo, ConnectorResult


class SnowflakeConnector(DatabaseConnector):

    @property
    def db_type(self) -> str:
        return "snowflake"

    @property
    def required_fields(self) -> list[str]:
        return ["account", "warehouse", "database", "schema"]

    def _get_connect_kwargs(self, credentials: dict) -> dict:
        """Build snowflake.connector.connect() kwargs from credentials dict."""
        kwargs = {
            "account": credentials["account"],
            "user": credentials.get("username", ""),
            "warehouse": credentials.get("warehouse", ""),
            "database": credentials.get("database", ""),
            "schema": credentials.get("schema", ""),
        }
        pat = os.environ.get("SNOWFLAKE_PAT")
        if pat:
            kwargs["authenticator"] = "PROGRAMMATIC_ACCESS_TOKEN"
            kwargs["token"] = pat
        elif credentials.get("password"):
            kwargs["password"] = credentials["password"]
        else:
            raise RuntimeError(
                "No Snowflake auth available: no PAT found and no password provided. "
                "Set SNOWFLAKE_PAT in .env or provide password."
            )
        return kwargs

    def test_connection(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            import snowflake.connector
            conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            return ConnectorResult(success=True, message="Connected to Snowflake.")
        except Exception as e:
            return ConnectorResult(success=False, message=f"Connection failed: {e}")
        finally:
            if conn:
                conn.close()

    def list_tables(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            import snowflake.connector
            conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
            cursor = conn.cursor()
            cursor.execute("SHOW TABLES")
            tables = [row[1] for row in cursor.fetchall()]  # name is column index 1
            cursor.close()
            return ConnectorResult(success=True, tables=tables)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list tables: {e}")
        finally:
            if conn:
                conn.close()

    @staticmethod
    def _quote_identifier(name: str) -> str:
        """Quote a Snowflake identifier (table/column name) safely."""
        return '"' + name.replace('"', '""') + '"'

    def get_table_schema(self, table: str, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            import snowflake.connector
            conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
            cursor = conn.cursor()
            cursor.execute(f"DESCRIBE TABLE {self._quote_identifier(table)}")
            columns = [ColumnInfo(name=row[0], type=row[1]) for row in cursor.fetchall()]
            cursor.close()
            return ConnectorResult(success=True, columns=columns)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to get schema: {e}")
        finally:
            if conn:
                conn.close()

    def sync_to_duckdb(
        self,
        tables: list[str],
        credentials: dict,
        duckdb_service: object,
        cache_dir: Path | None = None,
    ) -> list[dict]:
        import snowflake.connector
        import pyarrow as pa
        import pyarrow.parquet as pq

        conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
        results: list[dict] = []
        try:
            cursor = conn.cursor()
            for table in tables:
                cursor.execute(f"SELECT * FROM {self._quote_identifier(table)}")
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()
                arrow_table = pa.table(
                    {col: [row[i] for row in rows] for i, col in enumerate(columns)}
                )

                if cache_dir:
                    cache_subdir = cache_dir / table.lower()
                    cache_subdir.mkdir(parents=True, exist_ok=True)
                    pq_path = cache_subdir / f"{table.lower()}.parquet"
                else:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
                    pq_path = Path(tmp.name)
                    tmp.close()  # Close file handle; we only need the path

                # Wrap write + ingest so temp file is always cleaned up
                try:
                    pq.write_table(arrow_table, str(pq_path))
                    schema = duckdb_service.ingest_parquet(pq_path, table.lower())
                    results.append({
                        "source_id": schema.source_id,
                        "filename": schema.filename,
                        "row_count": schema.row_count,
                        "column_count": len(schema.columns),
                    })
                finally:
                    if not cache_dir:
                        pq_path.unlink(missing_ok=True)

            cursor.close()
        finally:
            conn.close()

        return results
