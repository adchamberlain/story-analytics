"""
Snowflake connector: sync tables from Snowflake into DuckDB via parquet.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .base import DatabaseConnector, ColumnInfo, ConnectorResult, QueryResult, SchemaColumn, SchemaTable, SchemaInfo, TableInfo


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
            rows = cursor.fetchall()
            # name at index 1, row count at index 7
            tables = [row[1] for row in rows]
            table_infos = [
                TableInfo(name=row[1], row_count=row[7] if len(row) > 7 else None)
                for row in rows
            ]
            cursor.close()
            return ConnectorResult(success=True, tables=tables, table_infos=table_infos)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list tables: {e}")
        finally:
            if conn:
                conn.close()

    @staticmethod
    def _quote_identifier(name: str) -> str:
        """Quote a Snowflake identifier (table/column name) safely."""
        return '"' + name.replace('"', '""') + '"'

    def list_schemas(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            import snowflake.connector
            conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
            cursor = conn.cursor()

            # Get all schemas in the database
            cursor.execute("SHOW SCHEMAS")
            schema_names = [row[1] for row in cursor.fetchall()]

            schemas: list[SchemaInfo] = []
            for schema_name in schema_names:
                # Get tables in this schema (row count is at index 7)
                cursor.execute(f"SHOW TABLES IN SCHEMA {self._quote_identifier(schema_name)}")
                table_rows = cursor.fetchall()

                tables: list[SchemaTable] = []
                for trow in table_rows:
                    table_name = trow[1]
                    row_count = trow[7] if len(trow) > 7 else None

                    # Get columns for this table
                    cursor.execute(
                        f"DESCRIBE TABLE {self._quote_identifier(schema_name)}"
                        f".{self._quote_identifier(table_name)}"
                    )
                    columns = [
                        SchemaColumn(name=crow[0], type=crow[1])
                        for crow in cursor.fetchall()
                    ]
                    tables.append(SchemaTable(name=table_name, columns=columns, row_count=row_count))

                schemas.append(SchemaInfo(name=schema_name, tables=tables))

            cursor.close()
            return ConnectorResult(success=True, schemas=schemas)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list schemas: {e}")
        finally:
            if conn:
                conn.close()

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
        max_rows: int | None = None,
    ) -> list[dict]:
        import snowflake.connector
        import pyarrow as pa
        import pyarrow.parquet as pq

        conn = snowflake.connector.connect(**self._get_connect_kwargs(credentials))
        results: list[dict] = []
        try:
            cursor = conn.cursor()
            for table in tables:
                sql = f"SELECT * FROM {self._quote_identifier(table)}"
                if max_rows is not None:
                    sql += f" LIMIT {max_rows}"
                cursor.execute(sql)
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

    def execute_query(self, sql: str, credentials: dict, limit: int = 10000, timeout: int = 30) -> QueryResult:
        """Execute a read-only SQL query against Snowflake and return results."""
        self.validate_sql(sql)

        import snowflake.connector

        kwargs = self._get_connect_kwargs(credentials)
        kwargs["network_timeout"] = timeout

        conn = snowflake.connector.connect(**kwargs)
        try:
            cursor = conn.cursor()

            # Always wrap in LIMIT subquery (database optimizes away redundant LIMIT)
            exec_sql = f"SELECT * FROM ({sql}) _q LIMIT {limit}"

            cursor.execute(exec_sql)

            columns = [desc[0] for desc in cursor.description]
            column_types = [str(desc[1]) for desc in cursor.description]

            raw_rows = cursor.fetchmany(limit)
            rows = [list(row) for row in raw_rows]
            truncated = len(rows) >= limit

            cursor.close()
            return QueryResult(
                columns=columns,
                column_types=column_types,
                rows=rows,
                row_count=len(rows),
                truncated=truncated,
            )
        finally:
            conn.close()
