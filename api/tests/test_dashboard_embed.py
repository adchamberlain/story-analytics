"""
Tests for dashboard embed / public endpoint.
GET /v2/dashboards/{id}/public — serves published dashboard with chart data.
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _create_dashboard(**overrides) -> dict:
    payload = {"title": "Embed Test Dashboard", "description": "Test embed"}
    payload.update(overrides)
    resp = client.post("/api/v2/dashboards/", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_dashboard(dashboard_id: str):
    client.delete(f"/api/v2/dashboards/{dashboard_id}")


class TestPublicDashboardEndpoint:
    def test_public_dashboard_published(self):
        """GET /v2/dashboards/{id}/public returns data for published dashboard."""
        dash = _create_dashboard()
        try:
            # Publish
            resp = client.put(f"/api/v2/dashboards/{dash['id']}/publish")
            assert resp.status_code == 200

            # Access public endpoint
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == dash["id"]
            assert data["title"] == "Embed Test Dashboard"
            assert "charts" in data
        finally:
            _cleanup_dashboard(dash["id"])

    def test_public_dashboard_draft(self):
        """GET /v2/dashboards/{id}/public returns 403 for draft dashboard."""
        dash = _create_dashboard()
        try:
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 403
            assert "not published" in resp.json()["detail"]
        finally:
            _cleanup_dashboard(dash["id"])

    def test_public_dashboard_not_found(self):
        """GET /v2/dashboards/{id}/public returns 404 for nonexistent dashboard."""
        resp = client.get("/api/v2/dashboards/deadbeef1234/public")
        assert resp.status_code == 404

    def test_publish_then_access(self):
        """Full flow: create → publish → access public endpoint."""
        dash = _create_dashboard(title="Flow Test", description="End-to-end")
        try:
            # Verify draft first
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 403

            # Publish
            resp = client.put(f"/api/v2/dashboards/{dash['id']}/publish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "published"

            # Now accessible
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 200
            data = resp.json()
            assert data["title"] == "Flow Test"
            assert data["description"] == "End-to-end"
        finally:
            _cleanup_dashboard(dash["id"])

    def test_unpublish_then_access(self):
        """Unpublish → public endpoint returns 403."""
        dash = _create_dashboard()
        try:
            # Publish
            client.put(f"/api/v2/dashboards/{dash['id']}/publish")

            # Verify accessible
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 200

            # Unpublish
            resp = client.put(f"/api/v2/dashboards/{dash['id']}/unpublish")
            assert resp.status_code == 200
            assert resp.json()["status"] == "draft"

            # Now blocked
            resp = client.get(f"/api/v2/dashboards/{dash['id']}/public")
            assert resp.status_code == 403
        finally:
            _cleanup_dashboard(dash["id"])
