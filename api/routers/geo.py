"""Geo intake endpoints: detect, preview, geocode."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth_simple import get_current_user
from ..services.duckdb_service import get_duckdb_service, _SAFE_SOURCE_ID_RE
from ..services import geocoding_service as geo

router = APIRouter(prefix="/data", tags=["geo"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class DetectGeoResponse(BaseModel):
    columns: list[dict]


class GeoPreviewRequest(BaseModel):
    column: str
    geo_type: str


class GeoPreviewResponse(BaseModel):
    results: list[dict]
    matched: int
    total: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_source(source_id: str) -> None:
    if not _SAFE_SOURCE_ID_RE.match(source_id):
        raise HTTPException(400, "Invalid source_id")
    svc = get_duckdb_service()
    if source_id not in svc._sources:
        raise HTTPException(404, f"Source {source_id!r} not found")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sources/{source_id}/detect-geo", response_model=DetectGeoResponse)
def detect_geo(source_id: str, user: dict = Depends(get_current_user)):
    _validate_source(source_id)
    svc = get_duckdb_service()
    schema = svc.get_schema(source_id)
    columns = [
        {"name": c.name, "type": c.type, "sample_values": c.sample_values}
        for c in schema.columns
    ]
    detected = geo.detect_geo_columns(columns)
    return DetectGeoResponse(
        columns=[
            {
                "name": d.name,
                "inferred_type": d.inferred_type,
                "confidence": d.confidence,
                "samples": d.samples,
            }
            for d in detected
        ]
    )


@router.post("/sources/{source_id}/geocode-preview", response_model=GeoPreviewResponse)
def geocode_preview(
    source_id: str,
    req: GeoPreviewRequest,
    user: dict = Depends(get_current_user),
):
    _validate_source(source_id)
    svc = get_duckdb_service()
    table = f"src_{source_id}"
    try:
        result = svc._conn.execute(
            f'SELECT DISTINCT "{req.column}" FROM {table} WHERE "{req.column}" IS NOT NULL LIMIT 20'
        ).fetchall()
    except Exception:
        raise HTTPException(400, f"Column {req.column!r} not found in source")
    values = [str(row[0]) for row in result]
    results = geo.geocode_values(values, req.geo_type)  # type: ignore[arg-type]
    return GeoPreviewResponse(
        results=[
            {"value": r.value, "lat": r.lat, "lon": r.lon, "matched": r.matched}
            for r in results
        ],
        matched=sum(1 for r in results if r.matched),
        total=len(results),
    )
