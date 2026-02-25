"""
Tests for archive/soft-delete and restore workflow.
Charts have an archived_at field: null (active) or ISO timestamp (archived).
"""
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _create_chart(**overrides) -> dict:
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Archive Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_chart(chart_id: str):
    client.delete(f"/api/v2/charts/{chart_id}")


class TestArchiveWorkflow:
    def test_new_chart_not_archived(self):
        """Newly created charts should have archived_at=null."""
        chart = _create_chart()
        try:
            assert chart.get("archived_at") is None
        finally:
            _cleanup_chart(chart["id"])

    def test_archive_chart(self):
        """PUT /v2/charts/{id}/archive sets archived_at to a timestamp."""
        chart = _create_chart()
        try:
            resp = client.put(f"/api/v2/charts/{chart['id']}/archive")
            assert resp.status_code == 200
            data = resp.json()
            assert data["archived_at"] is not None
            assert len(data["archived_at"]) > 0  # ISO timestamp string
        finally:
            _cleanup_chart(chart["id"])

    def test_archive_already_archived(self):
        """Archiving an already-archived chart is idempotent (no error)."""
        chart = _create_chart()
        try:
            resp1 = client.put(f"/api/v2/charts/{chart['id']}/archive")
            assert resp1.status_code == 200
            ts1 = resp1.json()["archived_at"]

            resp2 = client.put(f"/api/v2/charts/{chart['id']}/archive")
            assert resp2.status_code == 200
            # Should keep the original archived_at timestamp
            assert resp2.json()["archived_at"] == ts1
        finally:
            _cleanup_chart(chart["id"])

    def test_restore_chart(self):
        """PUT /v2/charts/{id}/restore clears archived_at."""
        chart = _create_chart()
        try:
            client.put(f"/api/v2/charts/{chart['id']}/archive")
            resp = client.put(f"/api/v2/charts/{chart['id']}/restore")
            assert resp.status_code == 200
            assert resp.json()["archived_at"] is None
        finally:
            _cleanup_chart(chart["id"])

    def test_restore_non_archived(self):
        """Restoring a non-archived chart is idempotent (no error)."""
        chart = _create_chart()
        try:
            resp = client.put(f"/api/v2/charts/{chart['id']}/restore")
            assert resp.status_code == 200
            assert resp.json()["archived_at"] is None
        finally:
            _cleanup_chart(chart["id"])

    def test_list_active_excludes_archived(self):
        """Default listing (status=active) should exclude archived charts."""
        chart = _create_chart(title="Active Chart for Archive Test")
        try:
            client.put(f"/api/v2/charts/{chart['id']}/archive")
            resp = client.get("/api/v2/charts/")
            assert resp.status_code == 200
            ids = [c["id"] for c in resp.json()]
            assert chart["id"] not in ids
        finally:
            _cleanup_chart(chart["id"])

    def test_list_archived_only(self):
        """status=archived returns only archived charts."""
        chart_active = _create_chart(title="Active for List Test")
        chart_archived = _create_chart(title="Archived for List Test")
        try:
            client.put(f"/api/v2/charts/{chart_archived['id']}/archive")
            resp = client.get("/api/v2/charts/?status=archived")
            assert resp.status_code == 200
            ids = [c["id"] for c in resp.json()]
            assert chart_archived["id"] in ids
            assert chart_active["id"] not in ids
        finally:
            _cleanup_chart(chart_active["id"])
            _cleanup_chart(chart_archived["id"])

    def test_list_all(self):
        """status=all returns both active and archived charts."""
        chart_active = _create_chart(title="Active All Test")
        chart_archived = _create_chart(title="Archived All Test")
        try:
            client.put(f"/api/v2/charts/{chart_archived['id']}/archive")
            resp = client.get("/api/v2/charts/?status=all")
            assert resp.status_code == 200
            ids = [c["id"] for c in resp.json()]
            assert chart_active["id"] in ids
            assert chart_archived["id"] in ids
        finally:
            _cleanup_chart(chart_active["id"])
            _cleanup_chart(chart_archived["id"])

    def test_archive_not_found(self):
        """Archiving a non-existent chart should return 404."""
        resp = client.put("/api/v2/charts/deadbeef1234/archive")
        assert resp.status_code == 404

    def test_restore_not_found(self):
        """Restoring a non-existent chart should return 404."""
        resp = client.put("/api/v2/charts/deadbeef1234/restore")
        assert resp.status_code == 404

    def test_archived_chart_still_loadable_by_id(self):
        """Archived charts should still be loadable by direct ID GET.

        Note: GET /v2/charts/{id} re-executes the SQL, which requires the source
        to exist. We verify the chart is found (not 404) — a 422 means the chart
        was loaded but SQL execution failed, which is fine for this test.
        """
        chart = _create_chart(title="Loadable After Archive")
        try:
            client.put(f"/api/v2/charts/{chart['id']}/archive")
            resp = client.get(f"/api/v2/charts/{chart['id']}")
            # Chart is found (not 404). May be 422 if SQL can't execute against
            # the test source, but the important thing is it's not 404.
            assert resp.status_code != 404, "Archived chart should still be loadable by ID"
        finally:
            _cleanup_chart(chart["id"])
