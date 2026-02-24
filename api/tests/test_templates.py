"""
Tests for chart duplication and template system.
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _create_chart(**overrides):
    """Helper: create a chart and return its ID."""
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
        "config": {"palette": "default", "showGrid": True},
        **overrides,
    }
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()["id"]


# ── Chart Duplication ──────────────────────────────────────────────────────


class TestChartDuplication:
    def test_duplicate_creates_new_chart(self):
        chart_id = _create_chart(title="Original Chart")
        resp = client.post(f"/api/v2/charts/{chart_id}/duplicate")
        assert resp.status_code == 200
        dup = resp.json()
        assert dup["id"] != chart_id
        assert dup["title"] == "Original Chart (Copy)"
        # Cleanup
        client.delete(f"/api/v2/charts/{dup['id']}")
        client.delete(f"/api/v2/charts/{chart_id}")

    def test_duplicate_preserves_config(self):
        chart_id = _create_chart(
            config={"palette": "Tableau10", "showGrid": False, "annotations": {"lines": [], "texts": [], "ranges": []}},
            subtitle="Sub",
            source="Source",
        )
        resp = client.post(f"/api/v2/charts/{chart_id}/duplicate")
        dup = resp.json()
        assert dup["config"]["palette"] == "Tableau10"
        assert dup["config"]["showGrid"] is False
        assert dup["subtitle"] == "Sub"
        assert dup["source"] == "Source"
        client.delete(f"/api/v2/charts/{dup['id']}")
        client.delete(f"/api/v2/charts/{chart_id}")

    def test_duplicate_preserves_sql(self):
        chart_id = _create_chart(sql="SELECT name, revenue FROM sales ORDER BY revenue DESC")
        resp = client.post(f"/api/v2/charts/{chart_id}/duplicate")
        dup = resp.json()
        assert dup["sql"] == "SELECT name, revenue FROM sales ORDER BY revenue DESC"
        client.delete(f"/api/v2/charts/{dup['id']}")
        client.delete(f"/api/v2/charts/{chart_id}")

    def test_duplicate_resets_status_to_draft(self):
        chart_id = _create_chart()
        client.put(f"/api/v2/charts/{chart_id}/publish")
        resp = client.post(f"/api/v2/charts/{chart_id}/duplicate")
        dup = resp.json()
        assert dup["status"] == "draft"
        client.delete(f"/api/v2/charts/{dup['id']}")
        client.delete(f"/api/v2/charts/{chart_id}")

    def test_duplicate_nonexistent_chart(self):
        resp = client.post("/api/v2/charts/doesnotexist/duplicate")
        assert resp.status_code == 404


# ── Template CRUD ──────────────────────────────────────────────────────────


class TestTemplateCRUD:
    def test_create_template(self):
        resp = client.post("/api/v2/templates/", json={
            "name": "Sales Bar Chart",
            "description": "Standard sales bar chart template",
            "chart_type": "BarChart",
            "config": {"palette": "default", "showGrid": True, "horizontal": False},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Sales Bar Chart"
        assert data["chart_type"] == "BarChart"
        assert "id" in data
        client.delete(f"/api/v2/templates/{data['id']}")

    def test_list_templates(self):
        # Create two templates
        r1 = client.post("/api/v2/templates/", json={
            "name": "Template A", "description": "A", "chart_type": "BarChart", "config": {},
        })
        r2 = client.post("/api/v2/templates/", json={
            "name": "Template B", "description": "B", "chart_type": "LineChart", "config": {},
        })
        id1, id2 = r1.json()["id"], r2.json()["id"]

        resp = client.get("/api/v2/templates/")
        assert resp.status_code == 200
        templates = resp.json()
        ids = [t["id"] for t in templates]
        assert id1 in ids
        assert id2 in ids

        client.delete(f"/api/v2/templates/{id1}")
        client.delete(f"/api/v2/templates/{id2}")

    def test_get_template(self):
        r = client.post("/api/v2/templates/", json={
            "name": "Detail Test", "description": "Test", "chart_type": "PieChart",
            "config": {"showLegend": True},
        })
        tid = r.json()["id"]
        resp = client.get(f"/api/v2/templates/{tid}")
        assert resp.status_code == 200
        assert resp.json()["config"]["showLegend"] is True
        client.delete(f"/api/v2/templates/{tid}")

    def test_update_template(self):
        r = client.post("/api/v2/templates/", json={
            "name": "Old Name", "description": "Old", "chart_type": "BarChart", "config": {},
        })
        tid = r.json()["id"]
        resp = client.put(f"/api/v2/templates/{tid}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        client.delete(f"/api/v2/templates/{tid}")

    def test_delete_template(self):
        r = client.post("/api/v2/templates/", json={
            "name": "To Delete", "description": "D", "chart_type": "BarChart", "config": {},
        })
        tid = r.json()["id"]
        resp = client.delete(f"/api/v2/templates/{tid}")
        assert resp.status_code == 200
        # Verify it's gone
        resp2 = client.get(f"/api/v2/templates/{tid}")
        assert resp2.status_code == 404

    def test_get_nonexistent_template(self):
        resp = client.get("/api/v2/templates/doesnotexist")
        assert resp.status_code == 404

    def test_delete_nonexistent_template(self):
        resp = client.delete("/api/v2/templates/doesnotexist")
        assert resp.status_code == 404


# ── Save Chart as Template ─────────────────────────────────────────────────


class TestSaveAsTemplate:
    def test_save_chart_as_template(self):
        chart_id = _create_chart(
            title="Revenue Chart",
            chart_type="LineChart",
            config={"palette": "Economist", "showGrid": True},
        )
        resp = client.post(f"/api/v2/charts/{chart_id}/save-as-template", json={
            "name": "Revenue Template",
            "description": "Monthly revenue line chart",
        })
        assert resp.status_code == 200
        tmpl = resp.json()
        assert tmpl["name"] == "Revenue Template"
        assert tmpl["chart_type"] == "LineChart"
        assert tmpl["config"]["palette"] == "Economist"
        client.delete(f"/api/v2/templates/{tmpl['id']}")
        client.delete(f"/api/v2/charts/{chart_id}")

    def test_save_nonexistent_chart_as_template(self):
        resp = client.post("/api/v2/charts/doesnotexist/save-as-template", json={
            "name": "Test", "description": "Test",
        })
        assert resp.status_code == 404
