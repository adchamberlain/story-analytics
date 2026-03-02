"""Tests for geo intake endpoints: detect-geo and geocode-preview."""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

_created_sources: list[str] = []


def _upload_csv(content: str, filename: str = "test_geo.csv") -> str:
    """Helper: upload CSV text via paste endpoint and return source_id."""
    resp = client.post(
        "/api/data/paste",
        json={"data": content, "name": filename},
    )
    assert resp.status_code == 200, resp.text
    sid = resp.json()["source_id"]
    _created_sources.append(sid)
    return sid


@pytest.fixture(autouse=True)
def _cleanup_sources():
    """Delete all sources created during each test."""
    _created_sources.clear()
    yield
    for sid in _created_sources:
        client.delete(f"/api/data/sources/{sid}")
    _created_sources.clear()


def test_detect_geo_finds_state_column():
    csv_content = "state,revenue\nCalifornia,100\nTexas,200\nFlorida,150\n"
    source_id = _upload_csv(csv_content, "sales_geo1.csv")

    resp = client.post(f"/api/data/sources/{source_id}/detect-geo")
    assert resp.status_code == 200
    data = resp.json()
    assert "columns" in data
    assert len(data["columns"]) >= 1
    col = data["columns"][0]
    assert col["name"] == "state"
    assert col["inferred_type"] == "state"
    assert col["confidence"] > 0


def test_detect_geo_empty_for_non_geo_data():
    csv_content = "product,price\nWidget,9.99\nGadget,19.99\n"
    source_id = _upload_csv(csv_content, "products_geo1.csv")

    resp = client.post(f"/api/data/sources/{source_id}/detect-geo")
    assert resp.status_code == 200
    assert resp.json()["columns"] == []


def test_detect_geo_invalid_source_id():
    resp = client.post("/api/data/sources/notvalid!!/detect-geo")
    assert resp.status_code == 400


def test_geocode_preview_returns_results(monkeypatch):
    # Monkeypatch geocode_values so no real Nominatim calls
    from api.services import geocoding_service as geo
    from api.services.geocoding_service import GeoResult
    monkeypatch.setattr(geo, "geocode_values", lambda values, geo_type, country="": [
        GeoResult(value=v, lat=30.0 + i, lon=-90.0, matched=True)
        for i, v in enumerate(values)
    ])

    csv_content = "state,revenue\nCalifornia,100\nTexas,200\nFlorida,150\n"
    source_id = _upload_csv(csv_content, "sales_geo2.csv")

    resp = client.post(
        f"/api/data/sources/{source_id}/geocode-preview",
        json={"column": "state", "geo_type": "state"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matched"] == 3
    assert data["total"] == 3
    assert len(data["results"]) == 3
    assert data["results"][0]["matched"] is True


def test_geocode_preview_unknown_column():
    csv_content = "state,revenue\nCalifornia,100\n"
    source_id = _upload_csv(csv_content, "sales_geo3.csv")

    resp = client.post(
        f"/api/data/sources/{source_id}/geocode-preview",
        json={"column": "nonexistent_col", "geo_type": "state"},
    )
    assert resp.status_code == 400


import time as _time


def test_geocode_full_starts_job():
    csv_content = "state,revenue\nCalifornia,100\nTexas,200\n"
    source_id = _upload_csv(csv_content, "states_full1.csv")

    resp = client.post(
        f"/api/data/sources/{source_id}/geocode-full",
        json={"column": "state", "geo_type": "state"},
    )
    assert resp.status_code == 200
    assert "job_id" in resp.json()


def test_geocode_status_returns_progress():
    csv_content = "state,revenue\nCalifornia,100\nTexas,200\n"
    source_id = _upload_csv(csv_content, "states_full2.csv")

    start = client.post(
        f"/api/data/sources/{source_id}/geocode-full",
        json={"column": "state", "geo_type": "state"},
    )
    job_id = start.json()["job_id"]

    # Poll until complete (max 15 seconds — states resolve via static lookup, should be fast)
    for _ in range(30):
        status = client.get(
            f"/api/data/sources/{source_id}/geocode-status/{job_id}",
        )
        assert status.status_code == 200
        data = status.json()
        assert "status" in data
        if data["status"] == "complete":
            assert data["resolved"] == 2
            break
        _time.sleep(0.5)
    else:
        pytest.fail(f"Geocoding job did not complete in time. Last status: {data}")


def test_geocode_full_writes_lat_lon_columns():
    csv_content = "state,revenue\nCalifornia,100\nTexas,200\n"
    source_id = _upload_csv(csv_content, "states_full3.csv")

    start = client.post(
        f"/api/data/sources/{source_id}/geocode-full",
        json={"column": "state", "geo_type": "state"},
    )
    job_id = start.json()["job_id"]

    for _ in range(30):
        status = client.get(
            f"/api/data/sources/{source_id}/geocode-status/{job_id}",
        )
        if status.json()["status"] == "complete":
            break
        _time.sleep(0.5)
    else:
        pytest.fail("Geocoding job did not complete in time")

    schema = client.get(f"/api/data/schema/{source_id}")
    col_names = [c["name"] for c in schema.json()["columns"]]
    assert "_lat" in col_names
    assert "_lon" in col_names


def test_geocode_status_unknown_job():
    csv_content = "state,revenue\nCalifornia,100\n"
    source_id = _upload_csv(csv_content, "states_full4.csv")

    resp = client.get(
        f"/api/data/sources/{source_id}/geocode-status/doesnotexist",
    )
    assert resp.status_code == 404
