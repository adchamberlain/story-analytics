"""Geo column detection, static resolution, Nominatim geocoding, job management."""
from __future__ import annotations
from typing import Literal

from .data.us_states import US_STATES
from .data.countries import COUNTRIES

GeoType = Literal["lat_lon", "state", "country", "zip", "fips", "city", "address"]

_NOMINATIM_CACHE: dict[str, tuple[float, float] | None] = {}


def resolve_static(value: str, geo_type: GeoType) -> tuple[float, float] | None:
    """Resolve a value to (lat, lon) using static lookup tables."""
    key = value.strip().lower()
    if geo_type == "state":
        return US_STATES.get(key)
    if geo_type == "country":
        return COUNTRIES.get(key)
    return None
