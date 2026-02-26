"""
PostgreSQL connector: sync tables from Postgres into DuckDB via parquet.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import re as _re

from .base import DatabaseConnector, ColumnInfo, ConnectorResult, SchemaColumn, SchemaTable, SchemaInfo

_SAFE_SCHEMA_RE = _re.compile(r'^[a-zA-Z_][a-zA-Z0-9_$]*$')


class PostgresConnector(DatabaseConnector):

    @staticmethod
    def _quote_identifier(name: str) -> str:
        """Quote a PostgreSQL identifier (table/schema name) safely."""
        return '"' + name.replace('"', '""') + '"'

    @property
    def db_type(self) -> str:
        return "postgres"

    @property
    def required_fields(self) -> list[str]:
        return ["host", "port", "database", "username", "password"]

    def _connect(self, credentials: dict):
        import psycopg2
        schema = credentials.get("schema", "")
        options = None
        if schema:
            if not _SAFE_SCHEMA_RE.match(schema):
                raise ValueError(f"Invalid schema name: {schema!r}")
            options = f"-c search_path={schema}"
        return psycopg2.connect(
            host=credentials["host"],
            port=int(credentials.get("port", 5432)),
            dbname=credentials["database"],
            user=credentials["username"],
            password=credentials["password"],
            options=options,
        )

    def test_connection(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            conn = self._connect(credentials)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            return ConnectorResult(success=True, message="Connected to PostgreSQL.")
        except Exception as e:
            return ConnectorResult(success=False, message=f"Connection failed: {e}")
        finally:
            if conn:
                conn.close()

    def list_tables(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            conn = self._connect(credentials)
            cursor = conn.cursor()
            schema = credentials.get("schema", "public")
            cursor.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = %s AND table_type = 'BASE TABLE' "
                "ORDER BY table_name",
                (schema,),
            )
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
            return ConnectorResult(success=True, tables=tables)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list tables: {e}")
        finally:
            if conn:
                conn.close()

    def list_schemas(self, credentials: dict) -> ConnectorResult:
        conn = None
        try:
            conn = self._connect(credentials)
            cursor = conn.cursor()

            # Get all user-visible schemas (exclude system schemas)
            cursor.execute(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT LIKE 'pg_%' "
                "AND schema_name != 'information_schema' "
                "ORDER BY schema_name"
            )
            schema_names = [row[0] for row in cursor.fetchall()]

            schemas: list[SchemaInfo] = []
            for schema_name in schema_names:
                # Get tables in this schema
                cursor.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_type = 'BASE TABLE' "
                    "ORDER BY table_name",
                    (schema_name,),
                )
                table_names = [row[0] for row in cursor.fetchall()]

                tables: list[SchemaTable] = []
                for table_name in table_names:
                    # Get columns for this table
                    cursor.execute(
                        "SELECT column_name, data_type FROM information_schema.columns "
                        "WHERE table_schema = %s AND table_name = %s "
                        "ORDER BY ordinal_position",
                        (schema_name, table_name),
                    )
                    columns = [
                        SchemaColumn(name=row[0], type=row[1])
                        for row in cursor.fetchall()
                    ]
                    tables.append(SchemaTable(name=table_name, columns=columns))

                # Get approximate row counts for all tables in this schema (fast)
                cursor.execute(
                    "SELECT relname, n_live_tup FROM pg_stat_user_tables "
                    "WHERE schemaname = %s",
                    (schema_name,),
                )
                row_counts = {row[0]: row[1] for row in cursor.fetchall()}

                for table in tables:
                    table.row_count = row_counts.get(table.name)

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
            conn = self._connect(credentials)
            cursor = conn.cursor()
            schema = credentials.get("schema", "public")
            cursor.execute(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = %s AND table_name = %s "
                "ORDER BY ordinal_position",
                (schema, table),
            )
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
        import pyarrow as pa
        import pyarrow.parquet as pq

        conn = self._connect(credentials)
        results: list[dict] = []
        try:
            cursor = conn.cursor()
            schema_name = credentials.get("schema", "public")

            for table in tables:
                cursor.execute(f'SELECT * FROM {self._quote_identifier(schema_name)}.{self._quote_identifier(table)}')
                col_names = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()

                # Build Arrow table
                col_data = {col: [row[i] for row in rows] for i, col in enumerate(col_names)}
                arrow_table = pa.table(col_data)

                # Write to parquet
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
                    source_schema = duckdb_service.ingest_parquet(pq_path, table.lower())
                    results.append({
                        "source_id": source_schema.source_id,
                        "filename": source_schema.filename,
                        "row_count": source_schema.row_count,
                        "column_count": len(source_schema.columns),
                    })
                finally:
                    if not cache_dir:
                        pq_path.unlink(missing_ok=True)

            cursor.close()
        finally:
            conn.close()

        return results
