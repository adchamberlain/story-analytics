"""Tests for folder CRUD and chart-folder association."""

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def _create_folder(name: str = "Test Folder", parent_id: str | None = None):
    body: dict = {"name": name}
    if parent_id:
        body["parent_id"] = parent_id
    resp = client.post("/api/folders/", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_chart():
    resp = client.post("/api/v2/charts/save", json={
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Folder Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    })
    return resp.json()["id"]


class TestFolderCRUD:
    def test_create_folder(self):
        folder = _create_folder("My Charts")
        assert folder["name"] == "My Charts"
        assert "id" in folder
        client.delete(f"/api/folders/{folder['id']}")

    def test_list_folders(self):
        f1 = _create_folder("Folder A")
        f2 = _create_folder("Folder B")
        resp = client.get("/api/folders/")
        assert resp.status_code == 200
        folders = resp.json()
        ids = [f["id"] for f in folders]
        assert f1["id"] in ids
        assert f2["id"] in ids
        client.delete(f"/api/folders/{f1['id']}")
        client.delete(f"/api/folders/{f2['id']}")

    def test_get_folder(self):
        folder = _create_folder("Details Folder")
        resp = client.get(f"/api/folders/{folder['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Details Folder"
        client.delete(f"/api/folders/{folder['id']}")

    def test_update_folder_name(self):
        folder = _create_folder("Old Name")
        resp = client.put(f"/api/folders/{folder['id']}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        client.delete(f"/api/folders/{folder['id']}")

    def test_delete_folder(self):
        folder = _create_folder("Doomed Folder")
        resp = client.delete(f"/api/folders/{folder['id']}")
        assert resp.status_code == 200
        resp = client.get(f"/api/folders/{folder['id']}")
        assert resp.status_code == 404

    def test_delete_nonexistent_folder(self):
        resp = client.delete("/api/folders/doesnotexist1")
        assert resp.status_code == 404

    def test_empty_name_rejected(self):
        resp = client.post("/api/folders/", json={"name": ""})
        assert resp.status_code == 400

    def test_unicode_folder_name(self):
        folder = _create_folder("📊 Données françaises")
        assert folder["name"] == "📊 Données françaises"
        client.delete(f"/api/folders/{folder['id']}")


class TestChartFolderAssociation:
    def test_assign_chart_to_folder(self):
        folder = _create_folder("Charts Folder")
        chart_id = _create_chart()
        resp = client.put(f"/api/v2/charts/{chart_id}", json={"folder_id": folder["id"]})
        assert resp.status_code == 200
        # Verify from the update response
        assert resp.json()["folder_id"] == folder["id"]
        client.delete(f"/api/v2/charts/{chart_id}")
        client.delete(f"/api/folders/{folder['id']}")

    def test_unassign_chart_from_folder(self):
        folder = _create_folder("Temp Folder")
        chart_id = _create_chart()
        # Assign
        client.put(f"/api/v2/charts/{chart_id}", json={"folder_id": folder["id"]})
        # Unassign
        resp = client.put(f"/api/v2/charts/{chart_id}", json={"folder_id": None})
        assert resp.status_code == 200
        assert resp.json()["folder_id"] is None
        client.delete(f"/api/v2/charts/{chart_id}")
        client.delete(f"/api/folders/{folder['id']}")

    def test_list_charts_in_folder(self):
        folder = _create_folder("Full Folder")
        c1 = _create_chart()
        c2 = _create_chart()
        client.put(f"/api/v2/charts/{c1}", json={"folder_id": folder["id"]})
        client.put(f"/api/v2/charts/{c2}", json={"folder_id": folder["id"]})

        resp = client.get(f"/api/folders/{folder['id']}/charts")
        assert resp.status_code == 200
        chart_ids = [c["id"] for c in resp.json()]
        assert c1 in chart_ids
        assert c2 in chart_ids

        client.delete(f"/api/v2/charts/{c1}")
        client.delete(f"/api/v2/charts/{c2}")
        client.delete(f"/api/folders/{folder['id']}")
