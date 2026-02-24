"""Tests for theme CRUD API."""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

SAMPLE_THEME_DATA = {
    "id": "test",
    "name": "Test Theme",
    "description": "A test theme",
    "palette": {
        "colors": ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#333333", "#999999"],
        "primary": "#ff0000",
    },
    "font": {
        "family": "Arial, sans-serif",
        "title": {"size": 20, "weight": 700, "color": "#000000"},
        "subtitle": {"size": 14, "weight": 400, "color": "#555555"},
        "source": {"size": 11, "weight": 400, "color": "#888888"},
        "axis": {"size": 12, "weight": 400, "color": "#555555"},
        "notes": {"size": 11, "weight": 400, "color": "#888888", "italic": True},
        "valueLabel": {"size": 11, "weight": 400},
        "tabularNums": True,
    },
    "plot": {
        "background": "#ffffff",
        "marginTop": 8,
        "marginRight": 16,
        "marginBottom": 36,
        "marginLeft": 48,
        "grid": {"x": False, "y": True, "color": "#e0e0e0", "shapeRendering": "crispEdges"},
        "axes": {"xLine": True, "yLine": False, "yStrokeWidth": 1},
        "baseline": {"color": "#333333", "width": 1},
        "barTrack": False,
        "barTrackColor": "#f0f0f0",
        "defaultLineWidth": 2,
    },
    "pie": {
        "innerRadius": 0,
        "labelStyle": "external",
        "connectorColor": "#999999",
        "connectorDotRadius": 3,
        "sliceStroke": "#ffffff",
        "sliceStrokeWidth": 1,
    },
    "card": {
        "background": "#ffffff",
        "borderColor": "#e0e0e0",
        "textSecondary": "#888888",
    },
}


class TestThemeCRUD:
    def test_create_theme(self):
        resp = client.post("/api/themes/", json={
            "name": "My Theme",
            "description": "Custom theme",
            "theme_data": SAMPLE_THEME_DATA,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "My Theme"
        assert data["description"] == "Custom theme"
        assert "id" in data
        assert "created_at" in data
        # Cleanup
        client.delete(f"/api/themes/{data['id']}")

    def test_list_themes(self):
        # Create two themes
        r1 = client.post("/api/themes/", json={
            "name": "Theme A",
            "theme_data": SAMPLE_THEME_DATA,
        })
        r2 = client.post("/api/themes/", json={
            "name": "Theme B",
            "theme_data": SAMPLE_THEME_DATA,
        })
        id1 = r1.json()["id"]
        id2 = r2.json()["id"]

        resp = client.get("/api/themes/")
        assert resp.status_code == 200
        names = [t["name"] for t in resp.json()]
        assert "Theme A" in names
        assert "Theme B" in names

        # Cleanup
        client.delete(f"/api/themes/{id1}")
        client.delete(f"/api/themes/{id2}")

    def test_get_theme(self):
        r = client.post("/api/themes/", json={
            "name": "Fetch Me",
            "theme_data": SAMPLE_THEME_DATA,
        })
        tid = r.json()["id"]

        resp = client.get(f"/api/themes/{tid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetch Me"
        assert resp.json()["theme_data"]["palette"]["primary"] == "#ff0000"

        client.delete(f"/api/themes/{tid}")

    def test_get_nonexistent_theme(self):
        resp = client.get("/api/themes/doesnotexist1")
        assert resp.status_code == 404

    def test_update_theme(self):
        r = client.post("/api/themes/", json={
            "name": "Original",
            "theme_data": SAMPLE_THEME_DATA,
        })
        tid = r.json()["id"]

        resp = client.put(f"/api/themes/{tid}", json={
            "name": "Updated",
            "description": "Now updated",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"
        assert resp.json()["description"] == "Now updated"
        # theme_data should be unchanged
        assert resp.json()["theme_data"]["palette"]["primary"] == "#ff0000"

        client.delete(f"/api/themes/{tid}")

    def test_update_theme_data(self):
        r = client.post("/api/themes/", json={
            "name": "Data Update",
            "theme_data": SAMPLE_THEME_DATA,
        })
        tid = r.json()["id"]

        new_data = {**SAMPLE_THEME_DATA, "palette": {**SAMPLE_THEME_DATA["palette"], "primary": "#00ff00"}}
        resp = client.put(f"/api/themes/{tid}", json={
            "theme_data": new_data,
        })
        assert resp.status_code == 200
        assert resp.json()["theme_data"]["palette"]["primary"] == "#00ff00"

        client.delete(f"/api/themes/{tid}")

    def test_delete_theme(self):
        r = client.post("/api/themes/", json={
            "name": "Delete Me",
            "theme_data": SAMPLE_THEME_DATA,
        })
        tid = r.json()["id"]

        resp = client.delete(f"/api/themes/{tid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Should be gone now
        resp = client.get(f"/api/themes/{tid}")
        assert resp.status_code == 404

    def test_delete_nonexistent_theme(self):
        resp = client.delete("/api/themes/doesnotexist1")
        assert resp.status_code == 404

    def test_unicode_theme_name(self):
        resp = client.post("/api/themes/", json={
            "name": "テーマ日本語 🎨",
            "description": "Ünïcödë description",
            "theme_data": SAMPLE_THEME_DATA,
        })
        assert resp.status_code == 200
        assert "テーマ" in resp.json()["name"]
        client.delete(f"/api/themes/{resp.json()['id']}")
