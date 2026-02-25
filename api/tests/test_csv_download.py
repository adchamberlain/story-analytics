"""
Tests for GET /v2/charts/{chart_id}/data.csv endpoint.
Validates CSV download, allowDataDownload flag, and error handling.
"""
import csv
import io

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

# Upload test data once and reuse the source_id across tests
_source_id: str | None = None


def _get_source_id() -> str:
    """Ensure test CSV data is uploaded and return the source_id."""
    global _source_id
    if _source_id is not None:
        return _source_id

    resp = client.post(
        "/api/data/paste",
        json={"data": "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,Chicago", "name": "csv_dl_test.csv"},
    )
    assert resp.status_code == 200
    _source_id = resp.json()["source_id"]
    return _source_id


def _create_chart(**overrides) -> dict:
    """Helper: create a chart with real data and return the response JSON."""
    sid = _get_source_id()
    payload = {
        "source_id": sid,
        "chart_type": "BarChart",
        "title": "CSV Test Chart",
        "sql": f"SELECT name, age, city FROM src_{sid}",
    }
    payload.update(overrides)
    resp = client.post("/api/v2/charts/save", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _cleanup_chart(chart_id: str):
    client.delete(f"/api/v2/charts/{chart_id}")


class TestCsvDownload:
    def test_csv_download_returns_valid_csv(self):
        """GET /v2/charts/{id}/data.csv returns CSV with correct headers."""
        chart = _create_chart()
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/data.csv")
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/csv")
            assert "attachment" in resp.headers.get("content-disposition", "")

            # Parse CSV and verify structure
            reader = csv.DictReader(io.StringIO(resp.text))
            rows = list(reader)
            assert len(rows) == 3
            assert "name" in reader.fieldnames
            assert "age" in reader.fieldnames
            assert "city" in reader.fieldnames
            # Verify data content
            assert rows[0]["name"] == "Alice"
            assert rows[1]["name"] == "Bob"
        finally:
            _cleanup_chart(chart["id"])

    def test_csv_download_filename_matches_title(self):
        """Content-Disposition filename should be derived from chart title."""
        chart = _create_chart(title="Monthly Revenue")
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/data.csv")
            assert resp.status_code == 200
            assert 'filename="Monthly Revenue.csv"' in resp.headers.get("content-disposition", "")
        finally:
            _cleanup_chart(chart["id"])

    def test_csv_download_nonexistent_chart_404(self):
        """GET /v2/charts/{bad_id}/data.csv returns 404 for missing chart."""
        resp = client.get("/api/v2/charts/deadbeef1234/data.csv")
        assert resp.status_code == 404

    def test_csv_download_allowed_by_default(self):
        """Charts without explicit allowDataDownload config allow download."""
        chart = _create_chart(config=None)
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/data.csv")
            assert resp.status_code == 200
        finally:
            _cleanup_chart(chart["id"])

    def test_csv_download_blocked_when_disabled(self):
        """Charts with allowDataDownload=False return 403."""
        chart = _create_chart(config={"allowDataDownload": False})
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/data.csv")
            assert resp.status_code == 403
            assert "disabled" in resp.json()["detail"].lower()
        finally:
            _cleanup_chart(chart["id"])

    def test_csv_download_allowed_when_explicitly_true(self):
        """Charts with allowDataDownload=True should allow download."""
        chart = _create_chart(config={"allowDataDownload": True})
        try:
            resp = client.get(f"/api/v2/charts/{chart['id']}/data.csv")
            assert resp.status_code == 200
        finally:
            _cleanup_chart(chart["id"])
