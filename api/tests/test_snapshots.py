"""
Tests for chart snapshot (static PNG fallback) endpoints.
POST /v2/charts/{id}/snapshot — upload PNG blob
GET  /v2/charts/{id}/snapshot.png — serve stored PNG
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

# Minimal valid PNG (1x1 pixel, ~67 bytes)
_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _create_chart(**overrides) -> dict:
    payload = {
        "source_id": "test123456ab",
        "chart_type": "BarChart",
        "title": "Snapshot Test Chart",
        "sql": "SELECT 1 as x, 2 as y",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_chart(chart_id: str):
    client.delete(f"/api/v2/charts/{chart_id}")
    # Also clean up snapshot file if it exists
    from pathlib import Path
    snapshot_path = Path(__file__).parent.parent / "routers" / ".." / ".." / "data" / "snapshots" / f"{chart_id}.png"
    # Use the same path as the router
    from api.routers.charts_v2 import SNAPSHOTS_DIR
    sp = SNAPSHOTS_DIR / f"{chart_id}.png"
    if sp.exists():
        sp.unlink()


class TestSnapshotUpload:
    def test_upload_snapshot(self):
        """POST /v2/charts/{id}/snapshot accepts PNG blob and returns 200."""
        chart = _create_chart()
        try:
            resp = client.post(
                f"/api/v2/charts/{chart['id']}/snapshot",
                content=_TINY_PNG,
                headers={"Content-Type": "image/png"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert f"/api/v2/charts/{chart['id']}/snapshot.png" in data["url"]
        finally:
            _cleanup_chart(chart["id"])

    def test_upload_snapshot_invalid_chart(self):
        """POST /v2/charts/{id}/snapshot returns 404 for nonexistent chart."""
        resp = client.post(
            "/api/v2/charts/deadbeef1234/snapshot",
            content=_TINY_PNG,
            headers={"Content-Type": "image/png"},
        )
        assert resp.status_code == 404

    def test_upload_snapshot_empty_body(self):
        """POST /v2/charts/{id}/snapshot returns 400 for empty body."""
        chart = _create_chart()
        try:
            resp = client.post(
                f"/api/v2/charts/{chart['id']}/snapshot",
                content=b"",
                headers={"Content-Type": "image/png"},
            )
            assert resp.status_code == 400
            assert "Empty body" in resp.json()["detail"]
        finally:
            _cleanup_chart(chart["id"])


class TestSnapshotRetrieval:
    def test_get_snapshot(self):
        """Upload then retrieve snapshot — verify content matches."""
        chart = _create_chart()
        try:
            # Upload
            client.post(
                f"/api/v2/charts/{chart['id']}/snapshot",
                content=_TINY_PNG,
                headers={"Content-Type": "image/png"},
            )
            # Retrieve
            resp = client.get(f"/api/v2/charts/{chart['id']}/snapshot.png")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "image/png"
            assert resp.content == _TINY_PNG
        finally:
            _cleanup_chart(chart["id"])

    def test_get_snapshot_not_found(self):
        """GET /v2/charts/{id}/snapshot.png returns 404 for missing snapshot."""
        chart = _create_chart()
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/snapshot.png")
            assert resp.status_code == 404
        finally:
            _cleanup_chart(chart["id"])
