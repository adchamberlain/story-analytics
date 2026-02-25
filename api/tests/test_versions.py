"""
Tests for version history: CRUD, restore, auto-prune at 50, 404s.
"""
import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient
from api.main import app
from api.services.version_storage import VERSIONS_DIR, MAX_VERSIONS

client = TestClient(app)


def _create_chart(**overrides) -> dict:
    """Helper: create a chart and return its JSON."""
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Version Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_chart(chart_id: str):
    """Delete chart and its versions directory."""
    client.delete(f"/api/v2/charts/{chart_id}")
    version_dir = VERSIONS_DIR / chart_id
    if version_dir.exists():
        shutil.rmtree(version_dir)


class TestCreateVersion:
    def test_create_version_manual(self):
        """POST /versions creates a manual snapshot."""
        chart = _create_chart()
        try:
            resp = client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "manual", "label": "My save point"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["version"] == 1
            assert data["trigger"] == "manual"
            assert data["label"] == "My save point"
            assert data["created_at"]
        finally:
            _cleanup_chart(chart["id"])

    def test_create_version_auto(self):
        """POST /versions with trigger='auto' works."""
        chart = _create_chart()
        try:
            resp = client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "auto"},
            )
            assert resp.status_code == 200
            assert resp.json()["trigger"] == "auto"
        finally:
            _cleanup_chart(chart["id"])

    def test_create_version_increments(self):
        """Version numbers auto-increment."""
        chart = _create_chart()
        try:
            resp1 = client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "manual"},
            )
            resp2 = client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "manual"},
            )
            assert resp1.json()["version"] == 1
            assert resp2.json()["version"] == 2
        finally:
            _cleanup_chart(chart["id"])

    def test_create_version_nonexistent_chart(self):
        """Creating a version for a nonexistent chart returns 404."""
        resp = client.post(
            "/api/v2/charts/deadbeef1234/versions",
            json={"trigger": "manual"},
        )
        assert resp.status_code == 404


class TestListVersions:
    def test_list_versions_empty(self):
        """Listing versions for a chart with none returns empty list."""
        chart = _create_chart()
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/versions")
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            _cleanup_chart(chart["id"])

    def test_list_versions_newest_first(self):
        """Versions are returned newest first."""
        chart = _create_chart()
        try:
            client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "manual", "label": "first"},
            )
            client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "auto", "label": "second"},
            )
            resp = client.get(f"/api/v2/charts/{chart['id']}/versions")
            assert resp.status_code == 200
            versions = resp.json()
            assert len(versions) == 2
            assert versions[0]["version"] == 2
            assert versions[0]["label"] == "second"
            assert versions[1]["version"] == 1
            assert versions[1]["label"] == "first"
        finally:
            _cleanup_chart(chart["id"])


class TestGetVersion:
    def test_get_version_content(self):
        """GET /versions/{v} returns full chart data."""
        chart = _create_chart(title="Snapshot Me")
        try:
            client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "publish"},
            )
            resp = client.get(f"/api/v2/charts/{chart['id']}/versions/1")
            assert resp.status_code == 200
            data = resp.json()
            assert data["version"] == 1
            assert data["trigger"] == "publish"
            assert data["chart_data"]["title"] == "Snapshot Me"
            assert data["chart_data"]["chart_type"] == "BarChart"
        finally:
            _cleanup_chart(chart["id"])

    def test_get_nonexistent_version(self):
        """GET /versions/999 returns 404."""
        chart = _create_chart()
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/versions/999")
            assert resp.status_code == 404
        finally:
            _cleanup_chart(chart["id"])


class TestRestoreVersion:
    def test_restore_version(self):
        """Restoring a version reverts the chart state."""
        chart = _create_chart(title="Original Title")
        chart_id = chart["id"]
        try:
            # Create version 1 with original title
            client.post(
                f"/api/v2/charts/{chart_id}/versions",
                json={"trigger": "manual"},
            )
            # Update the chart title
            resp = client.put(
                f"/api/v2/charts/{chart_id}",
                json={"title": "Updated Title"},
            )
            assert resp.status_code == 200
            assert resp.json()["title"] == "Updated Title"

            # Restore to version 1
            resp = client.post(
                f"/api/v2/charts/{chart_id}/versions/1/restore",
            )
            assert resp.status_code == 200
            assert resp.json()["restored"] is True

            # Verify title is reverted via the list endpoint (avoids SQL execution)
            resp = client.get("/api/v2/charts/")
            assert resp.status_code == 200
            found = [c for c in resp.json() if c["id"] == chart_id]
            assert len(found) == 1
            assert found[0]["title"] == "Original Title"
        finally:
            _cleanup_chart(chart_id)

    def test_restore_nonexistent_version(self):
        """Restoring a nonexistent version returns 404."""
        chart = _create_chart()
        try:
            resp = client.post(
                f"/api/v2/charts/{chart['id']}/versions/999/restore",
            )
            assert resp.status_code == 404
        finally:
            _cleanup_chart(chart["id"])

    def test_restore_creates_safety_version(self):
        """Restoring auto-creates a safety snapshot of the current state."""
        chart = _create_chart(title="Current")
        chart_id = chart["id"]
        try:
            # Create version 1
            client.post(
                f"/api/v2/charts/{chart_id}/versions",
                json={"trigger": "manual"},
            )
            # Restore to version 1
            client.post(f"/api/v2/charts/{chart_id}/versions/1/restore")

            # Should now have 2 versions: original + safety snapshot
            resp = client.get(f"/api/v2/charts/{chart_id}/versions")
            versions = resp.json()
            assert len(versions) == 2
            # The safety snapshot should have trigger "auto" and a label about restore
            safety = [v for v in versions if v["version"] == 2]
            assert len(safety) == 1
            assert safety[0]["trigger"] == "auto"
            assert "restore" in safety[0]["label"].lower()
        finally:
            _cleanup_chart(chart_id)


class TestDeleteVersion:
    def test_delete_version(self):
        """DELETE /versions/{v} removes the version."""
        chart = _create_chart()
        try:
            client.post(
                f"/api/v2/charts/{chart['id']}/versions",
                json={"trigger": "manual"},
            )
            resp = client.delete(f"/api/v2/charts/{chart['id']}/versions/1")
            assert resp.status_code == 200
            assert resp.json()["deleted"] is True

            # Confirm it's gone
            resp = client.get(f"/api/v2/charts/{chart['id']}/versions/1")
            assert resp.status_code == 404
        finally:
            _cleanup_chart(chart["id"])

    def test_delete_nonexistent_version(self):
        """Deleting a nonexistent version returns 404."""
        chart = _create_chart()
        try:
            resp = client.delete(f"/api/v2/charts/{chart['id']}/versions/999")
            assert resp.status_code == 404
        finally:
            _cleanup_chart(chart["id"])


class TestAutoprune:
    def test_prune_at_max_versions(self):
        """Creating more than MAX_VERSIONS prunes the oldest."""
        chart = _create_chart()
        chart_id = chart["id"]
        try:
            # Create MAX_VERSIONS + 5 versions
            for i in range(MAX_VERSIONS + 5):
                client.post(
                    f"/api/v2/charts/{chart_id}/versions",
                    json={"trigger": "auto", "label": f"v{i+1}"},
                )

            # List versions: should be exactly MAX_VERSIONS
            resp = client.get(f"/api/v2/charts/{chart_id}/versions")
            versions = resp.json()
            assert len(versions) == MAX_VERSIONS

            # The oldest kept version should be 6 (first 5 pruned)
            version_numbers = sorted(v["version"] for v in versions)
            assert version_numbers[0] == 6
            assert version_numbers[-1] == MAX_VERSIONS + 5
        finally:
            _cleanup_chart(chart_id)
