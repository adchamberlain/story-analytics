"""
Tests for query execution: SQL validation, QueryResult model, connector
implementations, and the /query endpoint.

Uses mocks for actual database calls. Uses tmp_path fixtures for isolation.
"""
from __future__ import annotations

import time
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


# ── SQL Validation Tests ────────────────────────────────────────────────────


@pytest.mark.unit
class TestSqlValidation:
    """Verify validate_sql() blocks dangerous SQL and allows safe queries."""

    def test_select_allowed(self):
        from api.services.connectors.base import DatabaseConnector

        DatabaseConnector.validate_sql("SELECT * FROM users")

    def test_with_select_allowed(self):
        from api.services.connectors.base import DatabaseConnector

        DatabaseConnector.validate_sql("WITH cte AS (SELECT 1) SELECT * FROM cte")

    def test_explain_allowed(self):
        from api.services.connectors.base import DatabaseConnector

        DatabaseConnector.validate_sql("EXPLAIN SELECT * FROM users")

    def test_insert_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("INSERT INTO users VALUES (1, 'a')")

    def test_drop_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("DROP TABLE users")

    def test_delete_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("DELETE FROM users WHERE id = 1")

    def test_update_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("UPDATE users SET name = 'x'")

    def test_alter_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("ALTER TABLE users ADD COLUMN age INT")

    def test_create_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("CREATE TABLE evil (id INT)")

    def test_truncate_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("TRUNCATE TABLE users")

    def test_empty_raises(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("")

    def test_whitespace_only_raises(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("   ")

    def test_select_with_leading_whitespace(self):
        from api.services.connectors.base import DatabaseConnector

        # Should not raise
        DatabaseConnector.validate_sql("  SELECT 1")

    def test_dangerous_keyword_in_select(self):
        """A SELECT containing a dangerous keyword should be blocked."""
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError, match="DROP"):
            DatabaseConnector.validate_sql("SELECT 1; DROP TABLE users")

    def test_grant_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("GRANT ALL ON users TO public")

    def test_revoke_blocked(self):
        from api.services.connectors.base import DatabaseConnector

        with pytest.raises(ValueError):
            DatabaseConnector.validate_sql("REVOKE ALL ON users FROM public")


# ── QueryResult Model Tests ─────────────────────────────────────────────────


@pytest.mark.unit
class TestQueryResult:
    """Verify QueryResult dataclass construction and defaults."""

    def test_basic_construction(self):
        from api.services.connectors.base import QueryResult

        result = QueryResult(
            columns=["id", "name"],
            column_types=["INTEGER", "VARCHAR"],
            rows=[[1, "Alice"], [2, "Bob"]],
            row_count=2,
        )
        assert result.columns == ["id", "name"]
        assert result.column_types == ["INTEGER", "VARCHAR"]
        assert result.rows == [[1, "Alice"], [2, "Bob"]]
        assert result.row_count == 2
        assert result.truncated is False

    def test_truncated_default_false(self):
        from api.services.connectors.base import QueryResult

        result = QueryResult(
            columns=[], column_types=[], rows=[], row_count=0,
        )
        assert result.truncated is False

    def test_truncated_explicit_true(self):
        from api.services.connectors.base import QueryResult

        result = QueryResult(
            columns=["x"], column_types=["INT"], rows=[[1]],
            row_count=1, truncated=True,
        )
        assert result.truncated is True


# ── Snowflake execute_query Tests ────────────────────────────────────────────


@pytest.mark.unit
class TestSnowflakeExecuteQuery:
    """Test Snowflake execute_query() with mocked snowflake.connector."""

    def test_execute_simple_select(self):
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        mock_cursor = MagicMock()
        mock_cursor.description = [
            ("ID", 0, None, None, None, None, None),
            ("NAME", 2, None, None, None, None, None),
        ]
        mock_cursor.fetchmany.return_value = [(1, "Alice"), (2, "Bob")]

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("snowflake.connector.connect", return_value=mock_conn):
            result = connector.execute_query(
                sql="SELECT id, name FROM users LIMIT 10",
                credentials={
                    "account": "test", "username": "u", "password": "p",
                    "warehouse": "wh", "database": "db", "schema": "public",
                },
            )

        assert result.columns == ["ID", "NAME"]
        assert result.row_count == 2
        assert result.rows == [[1, "Alice"], [2, "Bob"]]

    def test_execute_wraps_without_limit(self):
        """When SQL has no LIMIT, connector should wrap in a subquery with LIMIT."""
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        mock_cursor = MagicMock()
        mock_cursor.description = [("ID", 0, None, None, None, None, None)]
        mock_cursor.fetchmany.return_value = [(1,)]

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("snowflake.connector.connect", return_value=mock_conn):
            connector.execute_query(
                sql="SELECT id FROM users",
                credentials={
                    "account": "test", "username": "u", "password": "p",
                    "warehouse": "wh", "database": "db", "schema": "public",
                },
                limit=100,
            )

        # Check the executed SQL was wrapped
        executed_sql = mock_cursor.execute.call_args[0][0]
        assert "LIMIT 100" in executed_sql
        assert "_q" in executed_sql

    def test_execute_rejects_insert(self):
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        with pytest.raises(ValueError):
            connector.execute_query(
                sql="INSERT INTO users VALUES (1, 'x')",
                credentials={
                    "account": "test", "username": "u", "password": "p",
                    "warehouse": "wh", "database": "db", "schema": "public",
                },
            )

    def test_execute_marks_truncated(self):
        """When fetchmany returns exactly `limit` rows, result should be truncated."""
        from api.services.connectors.snowflake import SnowflakeConnector

        connector = SnowflakeConnector()

        mock_cursor = MagicMock()
        mock_cursor.description = [("ID", 0, None, None, None, None, None)]
        # Return exactly limit rows
        mock_cursor.fetchmany.return_value = [(i,) for i in range(5)]

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("snowflake.connector.connect", return_value=mock_conn):
            result = connector.execute_query(
                sql="SELECT id FROM users LIMIT 5",
                credentials={
                    "account": "test", "username": "u", "password": "p",
                    "warehouse": "wh", "database": "db", "schema": "public",
                },
                limit=5,
            )

        assert result.truncated is True
        assert result.row_count == 5


# ── PostgreSQL execute_query Tests ───────────────────────────────────────────


@pytest.mark.unit
class TestPostgresExecuteQuery:
    """Test Postgres execute_query() with mocked psycopg2."""

    def test_execute_simple_select(self):
        from api.services.connectors.postgres import PostgresConnector

        connector = PostgresConnector()

        mock_cursor = MagicMock()
        mock_cursor.description = [
            ("id", None, None, None, None, None, None),
            ("name", None, None, None, None, None, None),
        ]
        mock_cursor.fetchmany.return_value = [(1, "Alice"), (2, "Bob")]

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("psycopg2.connect", return_value=mock_conn):
            result = connector.execute_query(
                sql="SELECT id, name FROM users LIMIT 10",
                credentials={
                    "host": "localhost", "port": 5432,
                    "database": "testdb", "username": "u", "password": "p",
                },
            )

        assert result.columns == ["id", "name"]
        assert result.row_count == 2
        assert result.rows == [[1, "Alice"], [2, "Bob"]]

    def test_execute_sets_statement_timeout(self):
        from api.services.connectors.postgres import PostgresConnector

        connector = PostgresConnector()

        mock_cursor = MagicMock()
        mock_cursor.description = [("id", None, None, None, None, None, None)]
        mock_cursor.fetchmany.return_value = []

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("psycopg2.connect", return_value=mock_conn):
            connector.execute_query(
                sql="SELECT id FROM users LIMIT 1",
                credentials={
                    "host": "localhost", "port": 5432,
                    "database": "testdb", "username": "u", "password": "p",
                },
                timeout=15,
            )

        # First execute call should set statement_timeout (parameterized)
        calls = mock_cursor.execute.call_args_list
        assert "statement_timeout" in calls[0][0][0]
        assert calls[0][0][1] == (15000,)
        # Connection should be set to read-only mode
        mock_conn.set_session.assert_called_once_with(readonly=True)

    def test_execute_rejects_drop(self):
        from api.services.connectors.postgres import PostgresConnector

        connector = PostgresConnector()

        with pytest.raises(ValueError):
            connector.execute_query(
                sql="DROP TABLE users",
                credentials={
                    "host": "localhost", "port": 5432,
                    "database": "testdb", "username": "u", "password": "p",
                },
            )


# ── BigQuery execute_query Tests ─────────────────────────────────────────────


@pytest.mark.unit
class TestBigQueryExecuteQuery:
    """Test BigQuery execute_query() with mocked google.cloud.bigquery."""

    def test_execute_simple_select(self):
        from api.services.connectors.bigquery import BigQueryConnector

        connector = BigQueryConnector()

        # Mock query job result
        mock_field1 = MagicMock()
        mock_field1.name = "id"
        mock_field1.field_type = "INTEGER"
        mock_field2 = MagicMock()
        mock_field2.name = "name"
        mock_field2.field_type = "STRING"

        mock_row1 = MagicMock()
        mock_row1.values.return_value = [1, "Alice"]
        mock_row2 = MagicMock()
        mock_row2.values.return_value = [2, "Bob"]

        mock_result = MagicMock()
        mock_result.schema = [mock_field1, mock_field2]
        # Make the result iterable (returns Row objects)
        mock_result.__iter__ = lambda self: iter([
            MagicMock(**{"values.return_value": [1, "Alice"]}),
            MagicMock(**{"values.return_value": [2, "Bob"]}),
        ])
        mock_result.total_rows = 2

        mock_job = MagicMock()
        mock_job.result.return_value = mock_result

        mock_client = MagicMock()
        mock_client.query.return_value = mock_job

        with patch.object(connector, "_get_client", return_value=mock_client):
            result = connector.execute_query(
                sql="SELECT id, name FROM users LIMIT 10",
                credentials={
                    "project_id": "my-project",
                    "dataset": "analytics",
                    "service_account_json": "{}",
                },
            )

        assert result.columns == ["id", "name"]
        assert result.column_types == ["INTEGER", "STRING"]
        assert result.row_count == 2

    def test_execute_rejects_delete(self):
        from api.services.connectors.bigquery import BigQueryConnector

        connector = BigQueryConnector()

        with pytest.raises(ValueError):
            connector.execute_query(
                sql="DELETE FROM users WHERE id = 1",
                credentials={
                    "project_id": "my-project",
                    "dataset": "analytics",
                    "service_account_json": "{}",
                },
            )


# ── Query Endpoint Tests ────────────────────────────────────────────────────


@pytest.mark.unit
class TestQueryEndpoint:
    """Test the POST /{connection_id}/query endpoint."""

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

    def test_query_endpoint_success(self, tmp_path, monkeypatch):
        """Successful query returns results with execution time."""
        from fastapi.testclient import TestClient
        from api.services.connectors.base import QueryResult

        conn = self._setup_connection(tmp_path, monkeypatch)

        mock_result = QueryResult(
            columns=["id", "name"],
            column_types=["INTEGER", "VARCHAR"],
            rows=[[1, "Alice"]],
            row_count=1,
            truncated=False,
        )

        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = mock_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/query",
                json={"sql": "SELECT * FROM users", "limit": 100, "timeout": 30},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["columns"] == ["id", "name"]
        assert data["column_types"] == ["INTEGER", "VARCHAR"]
        assert data["rows"] == [[1, "Alice"]]
        assert data["row_count"] == 1
        assert data["truncated"] is False
        assert "execution_time_ms" in data
        assert isinstance(data["execution_time_ms"], int)

    def test_query_endpoint_sql_validation_error(self, tmp_path, monkeypatch):
        """SQL validation failure returns 400."""
        from fastapi.testclient import TestClient

        conn = self._setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.execute_query.side_effect = ValueError("Statement contains disallowed keyword: DROP")

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/query",
                json={"sql": "DROP TABLE users"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 400
        assert "DROP" in resp.json()["detail"]

    def test_query_endpoint_connection_not_found(self, tmp_path, monkeypatch):
        """Unknown connection ID returns 404."""
        from api.services.storage import LocalStorageBackend
        from fastapi.testclient import TestClient

        backend = LocalStorageBackend(str(tmp_path / "data"))
        monkeypatch.setattr("api.services.connection_service._storage", backend)

        from api.main import app
        client = TestClient(app)
        resp = client.post(
            "/api/connections/deadbeef/query",
            json={"sql": "SELECT 1"},
            headers={"Authorization": "Bearer dev-token"},
        )

        assert resp.status_code == 404

    def test_query_endpoint_no_credentials(self, tmp_path, monkeypatch):
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
            f"/api/connections/{conn.connection_id}/query",
            json={"sql": "SELECT 1"},
            headers={"Authorization": "Bearer dev-token"},
        )

        assert resp.status_code == 400
        assert "credentials" in resp.json()["detail"].lower()

    def test_query_endpoint_connector_exception(self, tmp_path, monkeypatch):
        """Generic connector exception returns 400 with error message."""
        from fastapi.testclient import TestClient

        conn = self._setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.execute_query.side_effect = RuntimeError("Connection timeout")

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/query",
                json={"sql": "SELECT 1"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 400
        assert "Connection timeout" in resp.json()["detail"]

    def test_query_endpoint_default_limit_and_timeout(self, tmp_path, monkeypatch):
        """Default limit (10000) and timeout (30) are used when not specified."""
        from fastapi.testclient import TestClient
        from api.services.connectors.base import QueryResult

        conn = self._setup_connection(tmp_path, monkeypatch)

        mock_result = QueryResult(
            columns=["x"], column_types=["INT"],
            rows=[[1]], row_count=1,
        )

        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = mock_result

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/query",
                json={"sql": "SELECT 1"},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        # Verify defaults were passed
        call_kwargs = mock_connector.execute_query.call_args
        assert call_kwargs.kwargs["limit"] == 10000
        assert call_kwargs.kwargs["timeout"] == 30
