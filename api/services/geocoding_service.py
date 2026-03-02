"""Static geo lookup: resolves state and country names to (lat, lon)."""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Literal

from .data.us_states import US_STATES
from .data.countries import COUNTRIES

GeoType = Literal["lat_lon", "state", "country", "zip", "fips", "city", "address"]


def resolve_static(value: str, geo_type: GeoType) -> tuple[float, float] | None:
    """Resolve a value to (lat, lon) using static lookup tables."""
    key = value.strip().lower()
    if geo_type == "state":
        return US_STATES.get(key)
    if geo_type == "country":
        return COUNTRIES.get(key)
    return None


@dataclass
class DetectedColumn:
    name: str
    inferred_type: GeoType
    confidence: float
    samples: list[str]


_LAT_LON_NAMES = re.compile(r'\b(lat|latitude|lon|lng|longitude)\b', re.I)
_GEO_NAME_PATTERNS: dict[str, re.Pattern] = {
    "state":   re.compile(r'\b(state|province|region)\b', re.I),
    "country": re.compile(r'\b(country|nation)\b', re.I),
    "zip":     re.compile(r'\b(zip|zipcode|zip_code|postal|postcode)\b', re.I),
    "fips":    re.compile(r'\b(fips|fips_code|county_fips)\b', re.I),
    "city":    re.compile(r'\b(city|town|municipality)\b', re.I),
    "address": re.compile(r'\b(address|addr|street)\b', re.I),
}
_ZIP_VALUE_RE = re.compile(r'^\d{5}(-\d{4})?$')


def _infer_type_from_values(samples: list[str]) -> GeoType | None:
    """Infer geo type from sample values alone."""
    clean = [s.strip() for s in samples if s.strip()]
    if not clean:
        return None
    # Zip code: 80%+ look like 5-digit postal codes
    if sum(1 for s in clean if _ZIP_VALUE_RE.match(s)) / len(clean) >= 0.8:
        return "zip"
    # State: 60%+ match known state names/abbreviations
    state_hits = sum(1 for s in clean if s.strip().lower() in US_STATES)
    if state_hits / len(clean) >= 0.6:
        return "state"
    # Country: 60%+ match known country names
    country_hits = sum(1 for s in clean if s.strip().lower() in COUNTRIES)
    if country_hits / len(clean) >= 0.6:
        return "country"
    return None


def detect_geo_columns(columns: list[dict]) -> list[DetectedColumn]:
    """
    Scan column names and sample values for likely geo columns.
    columns: list of {name, type, sample_values} dicts (from ColumnInfoResponse).
    """
    results: list[DetectedColumn] = []
    for col in columns:
        name: str = col["name"]
        samples: list[str] = [str(v) for v in (col.get("sample_values") or [])]

        # 1. lat/lon by name → highest confidence, skip further checks
        if _LAT_LON_NAMES.search(name):
            results.append(DetectedColumn(
                name=name, inferred_type="lat_lon", confidence=0.95, samples=samples
            ))
            continue

        # 2. Named pattern match
        matched_type: GeoType | None = None
        for geo_type, pattern in _GEO_NAME_PATTERNS.items():
            if pattern.search(name):
                matched_type = geo_type  # type: ignore[assignment]
                break

        # 3. Value-based inference
        value_type = _infer_type_from_values(samples)

        if matched_type and value_type and matched_type == value_type:
            results.append(DetectedColumn(
                name=name, inferred_type=matched_type, confidence=0.9, samples=samples
            ))
        elif matched_type:
            results.append(DetectedColumn(
                name=name, inferred_type=matched_type, confidence=0.75, samples=samples
            ))
        elif value_type:
            results.append(DetectedColumn(
                name=name, inferred_type=value_type, confidence=0.70, samples=samples
            ))
        # else: not detected as geo — skip

    return results
