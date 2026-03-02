import pytest
from api.services.geocoding_service import resolve_static, detect_geo_columns, DetectedColumn

def test_resolve_us_state_full_name():
    result = resolve_static("california", "state")
    assert result is not None
    lat, lon = result
    assert 32 < lat < 42
    assert -125 < lon < -114

def test_resolve_us_state_abbreviation():
    result = resolve_static("CA", "state")
    assert result is not None
    lat, lon = result
    assert 32 < lat < 42
    assert -125 < lon < -114

def test_resolve_country_name():
    result = resolve_static("germany", "country")
    assert result is not None
    lat, lon = result
    assert 47 < lat < 55

def test_resolve_unknown_returns_none():
    result = resolve_static("notaplace", "state")
    assert result is None

def test_resolve_unimplemented_geo_type_returns_none():
    # zip, fips, city, address not yet implemented — should return None
    assert resolve_static("90210", "zip") is None
    assert resolve_static("06001", "fips") is None


def test_detect_lat_lon_by_column_name():
    columns = [{"name": "latitude", "type": "number", "sample_values": ["37.7749", "34.0522"]}]
    result = detect_geo_columns(columns)
    assert len(result) == 1
    assert result[0].name == "latitude"
    assert result[0].inferred_type == "lat_lon"
    assert result[0].confidence >= 0.9

def test_detect_state_column():
    columns = [{"name": "state", "type": "text", "sample_values": ["California", "Texas", "Florida"]}]
    result = detect_geo_columns(columns)
    assert len(result) == 1
    assert result[0].inferred_type == "state"

def test_detect_zip_by_value_pattern():
    columns = [{"name": "location", "type": "text", "sample_values": ["90210", "10001", "77001"]}]
    result = detect_geo_columns(columns)
    assert len(result) == 1
    assert result[0].inferred_type == "zip"

def test_detect_country_column():
    columns = [{"name": "country", "type": "text", "sample_values": ["Germany", "France", "Japan"]}]
    result = detect_geo_columns(columns)
    assert len(result) == 1
    assert result[0].inferred_type == "country"

def test_no_false_positive_on_name_column():
    columns = [{"name": "customer_name", "type": "text", "sample_values": ["Alice", "Bob", "Charlie"]}]
    result = detect_geo_columns(columns)
    assert len(result) == 0


from unittest.mock import patch
from api.services.geocoding_service import geocode_values, GeoResult

def test_geocode_values_static_state():
    results = geocode_values(["california", "texas"], "state")
    assert results[0].value == "california"
    assert results[0].matched is True
    assert abs(results[0].lat - 36.116203) < 1.0
    assert results[1].matched is True

def test_geocode_values_unrecognized(monkeypatch):
    monkeypatch.setattr("api.services.geocoding_service._call_nominatim", lambda q: None)
    results = geocode_values(["notaplace123"], "state")
    assert results[0].matched is False
    assert results[0].lat is None

def test_geocode_values_deduplicates():
    """Same value only geocoded once — both results have same lat."""
    results = geocode_values(["california", "california", "texas"], "state")
    assert len(results) == 3
    assert results[0].lat == results[1].lat

def test_geocode_values_nominatim_called_for_city(monkeypatch):
    """City type falls through to Nominatim when not in static tables."""
    called_with = []
    def mock_nominatim(query: str) -> tuple[float, float] | None:
        called_with.append(query)
        return (30.2672, -97.7431)
    monkeypatch.setattr("api.services.geocoding_service._call_nominatim", mock_nominatim)
    results = geocode_values(["Austin TX"], "city")
    assert results[0].matched is True
    assert "Austin TX" in called_with
