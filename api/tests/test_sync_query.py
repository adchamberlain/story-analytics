"""
Tests for the POST /{connection_id}/sync-query endpoint.

Verifies that arbitrary SQL results are synced into DuckDB as a new source.
Uses mocks for actual database and DuckDB calls. Uses tmp_path for isolation.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path, monkeypatch):
    """Redirect credential storage to a temp directory for every test."""
    monkeypatch.setattr(
        "api.services.credential_store._CREDENTIALS_DIR",
        tmp_path / "credentials",
    )
    monkeypatch.setattr(
        "api.services.credential_store._fernet",
        None,
    )


# ── Helpers ─────────────────────────────────────────────────────────────────

def _setup_connection(tmp_path, monkeypatch):
    """Create a mock connection and stored credentials."""
    from api.services.connection_service import save_connection
    from api.services.credential_store import store_credentials
    from api.services.storage import LocalStorageBackend

    backend = LocalStorageBackend(str(tmp_path / "data"))
    monkeypatch.setattr("api.services.connection_service._storage", backend)

    conn = save_connection(
        name="Test DB",
        db_type="snowflake",
        config={"account": "test", "warehouse": "wh", "database": "db", "schema": "public"},
    )
    store_credentials(conn.connection_id, {"username": "u", "password": "p"})
    return conn


# ── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSyncQueryEndpoint:
    """Test the POST /{connection_id}/sync-query endpoint."""

    def test_sync_success(self, tmp_path, monkeypatch):
        """Successful sync returns source_id and row_count."""
        from fastapi.testclient import TestClient
        from api.services.connectors.base import QueryResult
        from api.services.duckdb_service import SourceSchema, ColumnInfo

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_query_result = QueryResult(
            columns=["id", "name"],
            column_types=["INTEGER", "VARCHAR"],
            rows=[[1, "Alice"], [2, "Bob"]],
            row_count=2,
            truncated=False,
        )

        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = mock_query_result

        mock_schema = SourceSchema(
            source_id="abc123def456",
            filename="Query Result",
            row_count=2,
            columns=[
                ColumnInfo(name="id", type="BIGINT", nullable=False,
                           sample_values=["1", "2"], null_count=0, distinct_count=2),
                ColumnInfo(name="name", type="VARCHAR", nullable=False,
                           sample_values=["Alice", "Bob"], null_count=0, distinct_count=2),
            ],
        )

        mock_duckdb = MagicMock()
        mock_duckdb.ingest_parquet.return_value = mock_schema

        with (
            patch("api.routers.connections.get_connector", return_value=mock_connector),
            patch("api.routers.connections.get_duckdb_service", return_value=mock_duckdb),
        ):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync-query",
                json={"sql": "SELECT id, name FROM users", "source_name": "My Query"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["source_id"] == "abc123def456"
        assert data["row_count"] == 2

        # Verify execute_query was called with correct params
        mock_connector.execute_query.assert_called_once()
        call_kwargs = mock_connector.execute_query.call_args
        assert call_kwargs.kwargs["sql"] == "SELECT id, name FROM users"
        assert call_kwargs.kwargs["limit"] == 10000
        assert call_kwargs.kwargs["timeout"] == 30

        # Verify ingest_parquet was called with the source name
        mock_duckdb.ingest_parquet.assert_called_once()
        ingest_args = mock_duckdb.ingest_parquet.call_args
        assert ingest_args[0][1] == "My Query"  # table_name_hint

    def test_sync_default_source_name(self, tmp_path, monkeypatch):
        """When source_name is omitted, defaults to 'Query Result'."""
        from fastapi.testclient import TestClient
        from api.services.connectors.base import QueryResult
        from api.services.duckdb_service import SourceSchema, ColumnInfo

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_query_result = QueryResult(
            columns=["x"], column_types=["INT"],
            rows=[[1]], row_count=1,
        )

        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = mock_query_result

        mock_schema = SourceSchema(
            source_id="aaa111bbb222",
            filename="Query Result",
            row_count=1,
            columns=[
                ColumnInfo(name="x", type="BIGINT", nullable=False,
                           sample_values=["1"], null_count=0, distinct_count=1),
            ],
        )

        mock_duckdb = MagicMock()
        mock_duckdb.ingest_parquet.return_value = mock_schema

        with (
            patch("api.routers.connections.get_connector", return_value=mock_connector),
            patch("api.routers.connections.get_duckdb_service", return_value=mock_duckdb),
        ):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync-query",
                json={"sql": "SELECT 1 AS x"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        # Verify default source_name was used
        ingest_args = mock_duckdb.ingest_parquet.call_args
        assert ingest_args[0][1] == "Query Result"

    def test_connection_not_found(self, tmp_path, monkeypatch):
        """Unknown connection ID returns 404."""
        from api.services.storage import LocalStorageBackend
        from fastapi.testclient import TestClient

        backend = LocalStorageBackend(str(tmp_path / "data"))
        monkeypatch.setattr("api.services.connection_service._storage", backend)

        from api.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/connections/deadbeef/sync-query",
            json={"sql": "SELECT 1"},
            headers={"Authorization": "Bearer dev-token"},
        )

        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_no_credentials(self, tmp_path, monkeypatch):
        """No stored credentials returns 400."""
        from api.services.connection_service import save_connection
        from api.services.storage import LocalStorageBackend
        from fastapi.testclient import TestClient

        backend = LocalStorageBackend(str(tmp_path / "data"))
        monkeypatch.setattr("api.services.connection_service._storage", backend)

        conn = save_connection(
            name="No Creds DB",
            db_type="snowflake",
            config={"account": "test", "warehouse": "wh", "database": "db", "schema": "public"},
        )

        from api.main import app
        client = TestClient(app)
        resp = client.post(
            f"/api/connections/{conn.connection_id}/sync-query",
            json={"sql": "SELECT 1"},
            headers={"Authorization": "Bearer dev-token"},
        )

        assert resp.status_code == 400
        assert "credentials" in resp.json()["detail"].lower()

    def test_sql_validation_error(self, tmp_path, monkeypatch):
        """INSERT/DELETE/DROP SQL returns 400."""
        from fastapi.testclient import TestClient

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.execute_query.side_effect = ValueError(
            "Only SELECT, WITH, and EXPLAIN statements are allowed"
        )

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync-query",
                json={"sql": "INSERT INTO users VALUES (1, 'x')"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 400
        assert "SELECT" in resp.json()["detail"]

    def test_query_execution_error(self, tmp_path, monkeypatch):
        """Generic query failure returns 400."""
        from fastapi.testclient import TestClient

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.execute_query.side_effect = RuntimeError("Connection timeout")

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync-query",
                json={"sql": "SELECT * FROM big_table"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 400
        assert "Connection timeout" in resp.json()["detail"]

    def test_empty_results_returns_400(self, tmp_path, monkeypatch):
        """Query that returns no data should return 400."""
        from fastapi.testclient import TestClient
        from api.services.connectors.base import QueryResult

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_query_result = QueryResult(
            columns=["x"], column_types=["INT"],
            rows=[], row_count=0,
        )

        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = mock_query_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync-query",
                json={"sql": "SELECT x FROM empty_table"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 400
        assert "no data" in resp.json()["detail"].lower()
