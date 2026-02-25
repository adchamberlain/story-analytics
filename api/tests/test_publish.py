"""
Tests for publish/unpublish workflow.
Charts and dashboards have a status field: 'draft' | 'published'.
"""
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _create_chart(**overrides) -> dict:
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Publish Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_chart(chart_id: str):
    client.delete(f"/api/v2/charts/{chart_id}")


class TestChartPublishWorkflow:
    def test_new_chart_defaults_to_draft(self):
        """Newly created charts should have status='draft'."""
        chart = _create_chart()
        try:
            assert chart.get("status") == "draft"
        finally:
            _cleanup_chart(chart["id"])

    def test_publish_chart(self):
        """PUT /v2/charts/{id}/publish sets status to 'published'."""
        chart = _create_chart()
        try:
            resp = client.put(f"/api/v2/charts/{chart['id']}/publish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "published"
        finally:
            _cleanup_chart(chart["id"])

    def test_unpublish_chart(self):
        """PUT /v2/charts/{id}/unpublish sets status back to 'draft'."""
        chart = _create_chart()
        try:
            client.put(f"/api/v2/charts/{chart['id']}/publish")
            resp = client.put(f"/api/v2/charts/{chart['id']}/unpublish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "draft"
        finally:
            _cleanup_chart(chart["id"])

    def test_public_endpoint_returns_published(self):
        """GET /v2/charts/{id}/public returns data for published charts."""
        chart = _create_chart()
        try:
            client.put(f"/api/v2/charts/{chart['id']}/publish")
            resp = client.get(f"/api/v2/charts/{chart['id']}/public")
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == chart["id"]
            assert data["status"] == "published"
        finally:
            _cleanup_chart(chart["id"])

    def test_public_endpoint_rejects_draft(self):
        """GET /v2/charts/{id}/public returns 403 for draft charts."""
        chart = _create_chart()
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/public")
            assert resp.status_code == 403
        finally:
            _cleanup_chart(chart["id"])

    def test_publish_nonexistent_chart(self):
        """Publish a chart that doesn't exist should 404."""
        resp = client.put("/api/v2/charts/deadbeef1234/publish")
        assert resp.status_code == 404

    def test_status_persists_in_list(self):
        """Published status should show in list endpoint."""
        chart = _create_chart()
        try:
            client.put(f"/api/v2/charts/{chart['id']}/publish")
            resp = client.get("/api/v2/charts/")
            assert resp.status_code == 200
            found = [c for c in resp.json() if c["id"] == chart["id"]]
            assert len(found) == 1
            assert found[0]["status"] == "published"
        finally:
            _cleanup_chart(chart["id"])


class TestDashboardPublishWorkflow:
    def test_new_dashboard_defaults_to_draft(self):
        """Newly created dashboards should have status='draft'."""
        resp = client.post("/api/v2/dashboards/", json={"title": "Pub Test"})
        assert resp.status_code == 200
        dash = resp.json()
        try:
            assert dash.get("status") == "draft"
        finally:
            client.delete(f"/api/v2/dashboards/{dash['id']}")

    def test_publish_dashboard(self):
        """PUT /v2/dashboards/{id}/publish sets status to 'published'."""
        resp = client.post("/api/v2/dashboards/", json={"title": "Pub Test"})
        dash = resp.json()
        try:
            resp = client.put(f"/api/v2/dashboards/{dash['id']}/publish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "published"
        finally:
            client.delete(f"/api/v2/dashboards/{dash['id']}")

    def test_unpublish_dashboard(self):
        """PUT /v2/dashboards/{id}/unpublish sets status back to 'draft'."""
        resp = client.post("/api/v2/dashboards/", json={"title": "Pub Test"})
        dash = resp.json()
        try:
            client.put(f"/api/v2/dashboards/{dash['id']}/publish")
            resp = client.put(f"/api/v2/dashboards/{dash['id']}/unpublish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "draft"
        finally:
            client.delete(f"/api/v2/dashboards/{dash['id']}")
