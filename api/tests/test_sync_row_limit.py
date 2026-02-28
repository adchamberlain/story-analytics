"""
Tests for max_rows limit enforcement in sync_to_duckdb().
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path, monkeypatch):
    from api.services.storage import LocalStorageBackend
    cred_backend = LocalStorageBackend(str(tmp_path))
    monkeypatch.setattr(
        "api.services.credential_store.get_storage",
        lambda: cred_backend,
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
class TestSyncRowLimit:
    """Verify max_rows is passed through to sync_to_duckdb."""

    def test_sync_passes_max_rows(self, tmp_path, monkeypatch):
        """The sync endpoint passes MAX_IMPORT_ROWS to connector.sync_to_duckdb."""
        from fastapi.testclient import TestClient
        from api.routers.connections import MAX_IMPORT_ROWS

        conn = _setup_connection(tmp_path, monkeypatch)

        mock_connector = MagicMock()
        mock_connector.sync_to_duckdb.return_value = [
            {"source_id": "abc123", "filename": "orders", "row_count": 100, "column_count": 3}
        ]

        with (
            patch("api.routers.connections.get_connector", return_value=mock_connector),
            patch("api.routers.connections.get_duckdb_service", return_value=MagicMock()),
        ):
            from api.main import app
            client = TestClient(app)
            resp = client.post(
                f"/api/connections/{conn.connection_id}/sync",
                json={
                    "tables": ["orders"],
                    "credentials": {},
                    "username": None,
                },
                headers={"Authorization": "Bearer dev-token"},
            )

        assert resp.status_code == 200
        # Verify max_rows was passed
        mock_connector.sync_to_duckdb.assert_called_once()
        call_kwargs = mock_connector.sync_to_duckdb.call_args
        assert call_kwargs.kwargs.get("max_rows") == MAX_IMPORT_ROWS

    def test_max_import_rows_constant(self):
        """MAX_IMPORT_ROWS is 1,000,000."""
        from api.routers.connections import MAX_IMPORT_ROWS
        assert MAX_IMPORT_ROWS == 1_000_000
