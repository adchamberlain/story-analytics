"""
Tests for schema introspection: data models, connector implementations, and caching endpoint.

Uses mocks for actual database calls. Uses tmp_path fixtures for isolation.
"""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch

import pytest


# ── Data Model Tests ─────────────────────────────────────────────────────────


@pytest.mark.unit
class TestSchemaDataModels:
    """Verify the schema introspection data models."""

    def test_schema_column_structure(self):
        from api.services.connectors.base import SchemaColumn

        col = SchemaColumn(name="id", type="INTEGER")
        assert col.name == "id"
        assert col.type == "INTEGER"

    def test_schema_table_structure(self):
        from api.services.connectors.base import SchemaColumn, SchemaTable

        col = SchemaColumn(name="id", type="INTEGER")
        table = SchemaTable(name="users", columns=[col], row_count=1000)
        assert table.name == "users"
        assert table.columns[0].name == "id"
        assert table.row_count == 1000

    def test_schema_table_row_count_default_none(self):
        from api.services.connectors.base import SchemaTable

        table = SchemaTable(name="empty", columns=[])
        assert table.row_count is None

    def test_schema_info_structure(self):
        from api.services.connectors.base import SchemaColumn, SchemaTable, SchemaInfo

        col = SchemaColumn(name="id", type="INTEGER")
        table = SchemaTable(name="users", columns=[col], row_count=1000)
        schema = SchemaInfo(name="public", tables=[table])
        assert schema.name == "public"
        assert len(schema.tables) == 1
        assert schema.tables[0].columns[0].name == "id"
        assert schema.tables[0].row_count == 1000

    def test_connector_result_with_schemas(self):
        from api.services.connectors.base import ConnectorResult, SchemaInfo

        result = ConnectorResult(
            success=True,
            schemas=[SchemaInfo(name="public", tables=[])]
        )
        assert len(result.schemas) == 1
        assert result.schemas[0].name == "public"

    def test_connector_result_schemas_default_empty(self):
        from api.services.connectors.base import ConnectorResult

        result = ConnectorResult(success=True)
        assert result.schemas == []

    def test_schema_info_multiple_tables(self):
        from api.services.connectors.base import SchemaColumn, SchemaTable, SchemaInfo

        tables = [
            SchemaTable(
                name="users",
                columns=[
                    SchemaColumn(name="id", type="INTEGER"),
                    SchemaColumn(name="name", type="VARCHAR"),
                ],
                row_count=500,
            ),
            SchemaTable(
                name="orders",
                columns=[
                    SchemaColumn(name="order_id", type="INTEGER"),
                    SchemaColumn(name="user_id", type="INTEGER"),
                    SchemaColumn(name="amount", type="DECIMAL"),
                ],
                row_count=10000,
            ),
        ]
        schema = SchemaInfo(name="public", tables=tables)
        assert len(schema.tables) == 2
        assert schema.tables[1].name == "orders"
        assert len(schema.tables[1].columns) == 3


# ── Snowflake Connector Tests ────────────────────────────────────────────────


@pytest.mark.unit
class TestSnowflakeListSchemas:
    """Test Snowflake list_schemas() with mocked snowflake.connector."""

    def test_list_schemas_success(self):
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        mock_cursor = MagicMock()

        # Track fetchall calls to return appropriate data
        fetchall_responses = iter([
            # SHOW SCHEMAS -> 2 schemas
            [("", "PUBLIC", "", "", "", ""), ("", "ANALYTICS", "", "", "", "")],
            # SHOW TABLES IN SCHEMA "PUBLIC" -> 1 table with row_count at index 7
            [("", "USERS", "", "", "", "", "", 500, "", "")],
            # DESCRIBE TABLE "PUBLIC"."USERS" -> 2 columns
            [("ID", "NUMBER(38,0)"), ("NAME", "VARCHAR(100)")],
            # SHOW TABLES IN SCHEMA "ANALYTICS" -> 1 table
            [("", "EVENTS", "", "", "", "", "", 2000, "", "")],
            # DESCRIBE TABLE "ANALYTICS"."EVENTS" -> 2 columns
            [("EVENT_ID", "NUMBER(38,0)"), ("TIMESTAMP", "TIMESTAMP_NTZ")],
        ])

        mock_cursor.fetchall = lambda: next(fetchall_responses)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("snowflake.connector.connect", return_value=mock_conn):
            result = connector.list_schemas({
                "account": "test", "username": "u", "password": "p",
                "warehouse": "wh", "database": "db", "schema": "public",
            })

        assert result.success is True
        assert len(result.schemas) == 2
        assert result.schemas[0].name == "PUBLIC"
        assert result.schemas[0].tables[0].name == "USERS"
        assert result.schemas[0].tables[0].row_count == 500
        assert result.schemas[0].tables[0].columns[0].name == "ID"
        assert result.schemas[1].name == "ANALYTICS"

    def test_list_schemas_connection_failure(self):
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        with patch("snowflake.connector.connect", side_effect=Exception("Connection refused")):
            result = connector.list_schemas({
                "account": "test", "username": "u", "password": "p",
                "warehouse": "wh", "database": "db", "schema": "public",
            })

        assert result.success is False
        assert "Connection refused" in result.message


# ── PostgreSQL Connector Tests ───────────────────────────────────────────────


@pytest.mark.unit
class TestPostgresListSchemas:
    """Test Postgres list_schemas() with mocked psycopg2."""

    def test_list_schemas_success(self):
        from api.services.connectors.postgres import PostgresConnector

        connector = PostgresConnector()

        mock_cursor = MagicMock()
        fetchall_responses = iter([
            # Schema names
            [("public",), ("sales",)],
            # Tables in "public"
            [("users",), ("orders",)],
            # Columns for "users"
            [("id", "integer"), ("name", "character varying")],
            # Columns for "orders"
            [("order_id", "integer"), ("total", "numeric")],
            # Row counts for "public" schema
            [("users", 500), ("orders", 1200)],
            # Tables in "sales"
            [("revenue",)],
            # Columns for "revenue"
            [("month", "date"), ("amount", "numeric")],
            # Row counts for "sales" schema
            [("revenue", 36)],
        ])
        mock_cursor.fetchall = lambda: next(fetchall_responses)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("psycopg2.connect", return_value=mock_conn):
            result = connector.list_schemas({
                "host": "localhost", "port": 5432,
                "database": "testdb", "username": "u", "password": "p",
            })

        assert result.success is True
        assert len(result.schemas) == 2
        assert result.schemas[0].name == "public"
        assert len(result.schemas[0].tables) == 2
        assert result.schemas[0].tables[0].name == "users"
        assert result.schemas[0].tables[0].row_count == 500
        assert result.schemas[0].tables[0].columns[0].name == "id"
        assert result.schemas[1].name == "sales"

    def test_list_schemas_connection_failure(self):
        from api.services.connectors.postgres import PostgresConnector

        connector = PostgresConnector()

        with patch("psycopg2.connect", side_effect=Exception("Connection refused")):
            result = connector.list_schemas({
                "host": "localhost", "port": 5432,
                "database": "testdb", "username": "u", "password": "p",
            })

        assert result.success is False
        assert "Connection refused" in result.message


# ── BigQuery Connector Tests ─────────────────────────────────────────────────


@pytest.mark.unit
class TestBigQueryListSchemas:
    """Test BigQuery list_schemas() with mocked google.cloud.bigquery."""

    def test_list_schemas_success(self):
        from api.services.connectors.bigquery import BigQueryConnector

        connector = BigQueryConnector()

        # Mock datasets (schemas in BigQuery)
        mock_dataset1 = MagicMock()
        mock_dataset1.dataset_id = "analytics"

        mock_dataset2 = MagicMock()
        mock_dataset2.dataset_id = "raw_data"

        # Mock tables for analytics dataset
        mock_table_ref1 = MagicMock()
        mock_table_ref1.table_id = "events"

        # Mock full table for get_table call
        mock_bq_field1 = MagicMock()
        mock_bq_field1.name = "event_id"
        mock_bq_field1.field_type = "INTEGER"
        mock_bq_field2 = MagicMock()
        mock_bq_field2.name = "event_name"
        mock_bq_field2.field_type = "STRING"

        mock_full_table1 = MagicMock()
        mock_full_table1.schema = [mock_bq_field1, mock_bq_field2]
        mock_full_table1.num_rows = 50000

        # Mock tables for raw_data dataset
        mock_table_ref2 = MagicMock()
        mock_table_ref2.table_id = "clicks"

        mock_bq_field3 = MagicMock()
        mock_bq_field3.name = "click_id"
        mock_bq_field3.field_type = "INTEGER"

        mock_full_table2 = MagicMock()
        mock_full_table2.schema = [mock_bq_field3]
        mock_full_table2.num_rows = 1000000

        # Set up client mock
        mock_client = MagicMock()
        mock_client.list_datasets.return_value = [mock_dataset1, mock_dataset2]
        mock_client.list_tables.side_effect = lambda ref: {
            "my-project.analytics": [mock_table_ref1],
            "my-project.raw_data": [mock_table_ref2],
        }[ref]
        mock_client.get_table.side_effect = lambda ref: {
            "my-project.analytics.events": mock_full_table1,
            "my-project.raw_data.clicks": mock_full_table2,
        }[ref]

        with patch.object(connector, "_get_client", return_value=mock_client):
            result = connector.list_schemas({
                "project_id": "my-project",
                "dataset": "analytics",
                "service_account_json": "{}",
            })

        assert result.success is True
        assert len(result.schemas) == 2
        assert result.schemas[0].name == "analytics"
        assert result.schemas[0].tables[0].name == "events"
        assert result.schemas[0].tables[0].row_count == 50000
        assert len(result.schemas[0].tables[0].columns) == 2

    def test_list_schemas_failure(self):
        from api.services.connectors.bigquery import BigQueryConnector

        connector = BigQueryConnector()

        with patch.object(connector, "_get_client", side_effect=Exception("Auth failed")):
            result = connector.list_schemas({
                "project_id": "my-project",
                "dataset": "analytics",
                "service_account_json": "{}",
            })

        assert result.success is False
        assert "Auth failed" in result.message


# ── Schema Cache Endpoint Tests ──────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path, monkeypatch):
    """Redirect credential storage to a temp directory for every test."""
    from api.services.storage import LocalStorageBackend
    cred_backend = LocalStorageBackend(str(tmp_path))
    monkeypatch.setattr(
        "api.services.credential_store.get_storage",
        lambda: cred_backend,
    )
    monkeypatch.setattr(
        "api.services.credential_store._fernet",
        None,
    )


@pytest.mark.unit
class TestSchemaCacheEndpoint:
    """Test the POST /{connection_id}/schema endpoint."""

    def _setup_connection(self, tmp_path, monkeypatch):
        """Create a mock connection and stored credentials."""
        from api.services.connection_service import save_connection
        from api.services.credential_store import store_credentials
        from api.services.storage import LocalStorageBackend

        # Redirect connection storage to tmp
        backend = LocalStorageBackend(str(tmp_path / "data"))
        monkeypatch.setattr("api.services.connection_service._storage", backend)

        conn = save_connection(
            name="Test DB",
            db_type="snowflake",
            config={"account": "test", "warehouse": "wh", "database": "db", "schema": "public"},
        )
        store_credentials(conn.connection_id, {"username": "u", "password": "p"})
        return conn

    def test_schema_endpoint_fresh_fetch(self, tmp_path, monkeypatch):
        """First call should fetch from connector and cache result."""
        from fastapi.testclient import TestClient

        conn = self._setup_connection(tmp_path, monkeypatch)

        # Redirect schema cache to tmp
        cache_dir = tmp_path / "schema_cache"
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        # Mock the connector to return schema data
        from api.services.connectors.base import SchemaInfo, SchemaTable, SchemaColumn, ConnectorResult

        mock_result = ConnectorResult(
            success=True,
            schemas=[
                SchemaInfo(name="public", tables=[
                    SchemaTable(name="users", columns=[
                        SchemaColumn(name="id", type="INTEGER"),
                    ], row_count=100),
                ]),
            ],
        )

        mock_connector = MagicMock()
        mock_connector.list_schemas.return_value = mock_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/schema",
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["schemas"]) == 1
        assert data["schemas"][0]["name"] == "public"
        assert data["stale"] is False
        assert "cached_at" in data

        # Verify cache file was written
        cache_file = cache_dir / f"{conn.connection_id}.json"
        assert cache_file.exists()

    def test_schema_endpoint_returns_cached(self, tmp_path, monkeypatch):
        """Second call should return cached result without hitting connector."""
        conn = self._setup_connection(tmp_path, monkeypatch)

        cache_dir = tmp_path / "schema_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        # Write a fresh cache entry
        cached_data = {
            "schemas": [{"name": "public", "tables": []}],
            "cached_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        cache_file = cache_dir / f"{conn.connection_id}.json"
        cache_file.write_text(json.dumps(cached_data))

        # Should NOT call the connector
        mock_connector = MagicMock()
        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/schema",
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["stale"] is False
        # Connector should NOT have been called
        mock_connector.list_schemas.assert_not_called()

    def test_schema_endpoint_stale_cache(self, tmp_path, monkeypatch):
        """Cached data older than 1 hour should be marked stale but still returned."""
        conn = self._setup_connection(tmp_path, monkeypatch)

        cache_dir = tmp_path / "schema_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        # Write an old cache entry (2 hours ago)
        old_time = time.gmtime(time.time() - 7200)
        cached_data = {
            "schemas": [{"name": "public", "tables": []}],
            "cached_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", old_time),
        }
        cache_file = cache_dir / f"{conn.connection_id}.json"
        cache_file.write_text(json.dumps(cached_data))

        mock_connector = MagicMock()
        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/schema",
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["stale"] is True
        # Connector should NOT have been called -- stale cache is still returned
        mock_connector.list_schemas.assert_not_called()

    def test_schema_endpoint_refresh_forces_refetch(self, tmp_path, monkeypatch):
        """refresh=true should ignore cache and re-fetch from connector."""
        conn = self._setup_connection(tmp_path, monkeypatch)

        cache_dir = tmp_path / "schema_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        # Write a fresh cache entry
        cached_data = {
            "schemas": [{"name": "old_schema", "tables": []}],
            "cached_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        cache_file = cache_dir / f"{conn.connection_id}.json"
        cache_file.write_text(json.dumps(cached_data))

        # Mock connector to return new data
        from api.services.connectors.base import SchemaInfo, ConnectorResult

        mock_result = ConnectorResult(
            success=True,
            schemas=[SchemaInfo(name="new_schema", tables=[])],
        )
        mock_connector = MagicMock()
        mock_connector.list_schemas.return_value = mock_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/schema?refresh=true",
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["schemas"][0]["name"] == "new_schema"
        assert data["stale"] is False
        mock_connector.list_schemas.assert_called_once()

    def test_schema_endpoint_connector_failure(self, tmp_path, monkeypatch):
        """If connector fails and no cache exists, return 500."""
        conn = self._setup_connection(tmp_path, monkeypatch)

        cache_dir = tmp_path / "schema_cache"
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        from api.services.connectors.base import ConnectorResult

        mock_result = ConnectorResult(success=False, message="Auth failed")
        mock_connector = MagicMock()
        mock_connector.list_schemas.return_value = mock_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/schema",
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 500

    def test_schema_endpoint_404_unknown_connection(self, tmp_path, monkeypatch):
        """Unknown connection ID returns 404."""
        from api.services.storage import LocalStorageBackend

        backend = LocalStorageBackend(str(tmp_path / "data"))
        monkeypatch.setattr("api.services.connection_service._storage", backend)

        cache_dir = tmp_path / "schema_cache"
        monkeypatch.setattr(
            "api.routers.connections._SCHEMA_CACHE_DIR",
            cache_dir,
        )

        from api.main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.post(
            "/api/connections/deadbeef/schema",
            headers={"Authorization": "Bearer dev-token"},
        )
        assert resp.status_code == 404
