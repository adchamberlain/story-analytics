import pytest
from api.services.geocoding_service import resolve_static

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
