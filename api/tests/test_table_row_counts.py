"""
Tests for table_infos with row counts in connector results and API responses.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from api.services.connectors.base import ConnectorResult, TableInfo


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "api.services.credential_store._CREDENTIALS_DIR",
        tmp_path / "credentials",
    )
    monkeypatch.setattr("api.services.credential_store._fernet", None)


def _setup_connection(tmp_path, monkeypatch):
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
class TestTableInfoInConnectorResult:
    """TableInfo dataclass is correctly populated."""

    def test_table_info_fields(self):
        ti = TableInfo(name="orders", row_count=150000)
        assert ti.name == "orders"
        assert ti.row_count == 150000

    def test_table_info_null_row_count(self):
        ti = TableInfo(name="events")
        assert ti.row_count is None

    def test_connector_result_table_infos(self):
        result = ConnectorResult(
            success=True,
            tables=["orders", "users"],
            table_infos=[
                TableInfo(name="orders", row_count=500000),
                TableInfo(name="users", row_count=1200),
            ],
        )
        assert len(result.table_infos) == 2
        assert result.table_infos[0].row_count == 500000


@pytest.mark.unit
class TestTableInfoInTestEndpoint:
    """Test endpoint returns table_infos alongside tables."""

    def test_table_infos_returned(self, tmp_path, monkeypatch):
        from fastapi.testclient import TestClient

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.test_connection.return_value = ConnectorResult(
            success=True, message="OK"
        )
        mock_connector.list_tables.return_value = ConnectorResult(
            success=True,
            tables=["orders", "users"],
            table_infos=[
                TableInfo(name="orders", row_count=500000),
                TableInfo(name="users", row_count=1200),
            ],
        )

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/test",
                json={"credentials": {}, "username": None},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["tables"] == ["orders", "users"]
        assert len(data["table_infos"]) == 2
        assert data["table_infos"][0]["name"] == "orders"
        assert data["table_infos"][0]["row_count"] == 500000
        assert data["table_infos"][1]["name"] == "users"
        assert data["table_infos"][1]["row_count"] == 1200

    def test_table_infos_empty_on_failure(self, tmp_path, monkeypatch):
        from fastapi.testclient import TestClient

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.test_connection.return_value = ConnectorResult(
            success=True, message="OK"
        )
        mock_connector.list_tables.return_value = ConnectorResult(
            success=False, message="Failed"
        )

        with patch("api.routers.connections.get_connector", return_value=mock_connector):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/test",
                json={"credentials": {}, "username": None},
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["table_infos"] == []
