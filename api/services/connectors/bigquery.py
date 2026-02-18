"""
BigQuery connector: sync tables from BigQuery into DuckDB via parquet.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .base import DatabaseConnector, ColumnInfo, ConnectorResult


class BigQueryConnector(DatabaseConnector):

    @property
    def db_type(self) -> str:
        return "bigquery"

    @property
    def required_fields(self) -> list[str]:
        return ["project_id", "dataset", "service_account_json"]

    def _get_client(self, credentials: dict):
        from google.cloud import bigquery
        from google.oauth2 import service_account

        sa_json = credentials["service_account_json"]
        # Accept either a JSON string or a dict
        if isinstance(sa_json, str):
            sa_info = json.loads(sa_json)
        else:
            sa_info = sa_json

        creds = service_account.Credentials.from_service_account_info(sa_info)
        return bigquery.Client(
            project=credentials["project_id"],
            credentials=creds,
        )

    def test_connection(self, credentials: dict) -> ConnectorResult:
        try:
            client = self._get_client(credentials)
            dataset_ref = f"{credentials['project_id']}.{credentials['dataset']}"
            client.get_dataset(dataset_ref)
            return ConnectorResult(success=True, message="Connected to BigQuery.")
        except Exception as e:
            return ConnectorResult(success=False, message=f"Connection failed: {e}")

    def list_tables(self, credentials: dict) -> ConnectorResult:
        try:
            client = self._get_client(credentials)
            dataset_ref = f"{credentials['project_id']}.{credentials['dataset']}"
            tables_iter = client.list_tables(dataset_ref)
            tables = [t.table_id for t in tables_iter]
            return ConnectorResult(success=True, tables=tables)
        except Exception as e:
            return ConnectorResult(success=False, message=f"Failed to list tables: {e}")

    def get_table_schema(self, table: str, credentials: dict) -> ConnectorResult:
        try:
            client = self._get_client(credentials)
            table_ref = f"{credentials['project_id']}.{credentials['dataset']}.{table}"
            bq_table = client.get_table(table_ref)
            columns = [ColumnInfo(name=f.name, type=f.field_type) for f in bq_table.schema]
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
        import pyarrow.parquet as pq

        client = self._get_client(credentials)
        results: list[dict] = []

        for table in tables:
            table_ref = f"{credentials['project_id']}.{credentials['dataset']}.{table}"

            # Use BigQuery Storage API for efficient Arrow export
            arrow_table = client.list_rows(table_ref).to_arrow()

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

        return results
