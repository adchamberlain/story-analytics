"""
PostgreSQL connector: sync tables from Postgres into DuckDB via parquet.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from .base import DatabaseConnector, ColumnInfo, ConnectorResult


class PostgresConnector(DatabaseConnector):

    @property
    def db_type(self) -> str:
        return "postgres"

    @property
    def required_fields(self) -> list[str]:
        return ["host", "port", "database", "username", "password"]

    def _connect(self, credentials: dict):
        import psycopg2
        return psycopg2.connect(
            host=credentials["host"],
            port=int(credentials.get("port", 5432)),
            dbname=credentials["database"],
            user=credentials["username"],
            password=credentials["password"],
            options=f"-c search_path={credentials.get('schema', 'public')}" if credentials.get("schema") else None,
        )

    def test_connection(self, credentials: dict) -> ConnectorResult:
        try:
            conn = self._connect(credentials)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            conn.close()
            return ConnectorResult(success=True, message="Connected to PostgreSQL.")
        except Exception as e:
            return ConnectorResult(success=False, message=f"Connection failed: {e}")

    def list_tables(self, credentials: dict) -> ConnectorResult:
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
            conn.close()
            return ConnectorResult(success=True, tables=tables)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list tables: {e}")

    def get_table_schema(self, table: str, credentials: dict) -> ConnectorResult:
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
            conn.close()
            return ConnectorResult(success=True, columns=columns)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to get schema: {e}")

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
                cursor.execute(f'SELECT * FROM "{schema_name}"."{table}"')
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

                pq.write_table(arrow_table, str(pq_path))

                # Ingest into DuckDB
                source_schema = duckdb_service.ingest_parquet(pq_path, table.lower())
                results.append({
                    "source_id": source_schema.source_id,
                    "filename": source_schema.filename,
                    "row_count": source_schema.row_count,
                    "column_count": len(source_schema.columns),
                })

                if not cache_dir:
                    pq_path.unlink(missing_ok=True)

            cursor.close()
        finally:
            conn.close()

        return results
