"""Geo intake endpoints: detect, preview, geocode."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

GeoTypeLiteral = Literal["lat_lon", "state", "country", "zip", "fips", "city", "address"]

from ..auth_simple import get_current_user
from ..services.duckdb_service import get_duckdb_service, _SAFE_SOURCE_ID_RE
from ..services import geocoding_service as geo
from .transforms import _get_source_info, _read_csv, _write_csv

router = APIRouter(prefix="/data", tags=["geo"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class DetectGeoResponse(BaseModel):
    columns: list[dict]


class GeoPreviewRequest(BaseModel):
    column: str
    geo_type: GeoTypeLiteral


class GeoPreviewResponse(BaseModel):
    results: list[dict]
    matched: int
    total: int


class GeoFullRequest(BaseModel):
    column: str
    geo_type: GeoTypeLiteral


class GeoFullResponse(BaseModel):
    job_id: str


class GeoStatusResponse(BaseModel):
    status: str
    resolved: int
    total: int
    error: str | None = None


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

    # Validate column exists in schema (prevents SQL injection via column name)
    schema = svc.get_schema(source_id)
    known_columns = {c.name for c in schema.columns}
    if req.column not in known_columns:
        raise HTTPException(400, f"Column {req.column!r} not found in source")

    table = f"src_{source_id}"
    # Escape double-quotes in identifier (defense in depth)
    safe_column = req.column.replace('"', '""')
    with svc._lock:
        result = svc._conn.execute(
            f'SELECT DISTINCT "{safe_column}" FROM {table} WHERE "{safe_column}" IS NOT NULL LIMIT 20'
        ).fetchall()

    values = [str(row[0]) for row in result]
    results = geo.geocode_values(values, req.geo_type)
    return GeoPreviewResponse(
        results=[
            {"value": r.value, "lat": r.lat, "lon": r.lon, "matched": r.matched}
            for r in results
        ],
        matched=sum(1 for r in results if r.matched),
        total=len(results),
    )


def _run_geocode_full(job_id: str, source_id: str, column: str, geo_type: str) -> None:
    """Background task: geocode all rows, write _lat/_lon columns back to CSV."""
    try:
        _path, key = _get_source_info(source_id)
        columns, rows = _read_csv(key)

        # Guard: column must exist in the CSV (defensive check before iterating rows)
        if column not in set(columns):
            raise ValueError(f"Column {column!r} not found in CSV headers: {columns}")

        # Collect unique non-empty values
        unique_values = list(dict.fromkeys(
            str(r.get(column, "")) for r in rows
            if r.get(column) and str(r.get(column, "")).strip()
        ))
        geo.update_job_progress(job_id, resolved=0, total=len(unique_values))

        # Geocode unique values
        results = geo.geocode_values(unique_values, geo_type)
        lookup = {r.value: (r.lat, r.lon) for r in results if r.matched}

        # Add _lat/_lon columns if not present
        if "_lat" not in columns:
            columns.append("_lat")
        if "_lon" not in columns:
            columns.append("_lon")

        # Write lat/lon back to each row
        resolved = len(lookup)  # number of unique values that matched
        for row in rows:
            val = str(row.get(column, ""))
            coords = lookup.get(val)
            row["_lat"] = str(coords[0]) if coords else ""
            row["_lon"] = str(coords[1]) if coords else ""

        _write_csv(key, columns, rows)

        # Re-ingest into DuckDB
        svc = get_duckdb_service()
        svc.reload_source(source_id)

        geo.update_job_progress(job_id, resolved=resolved, total=len(unique_values), status="complete")
    except Exception as e:
        import traceback
        traceback.print_exc()
        geo.update_job_progress(job_id, resolved=0, total=0, status="failed", error=str(e))


@router.post("/sources/{source_id}/geocode-full", response_model=GeoFullResponse)
def geocode_full(
    source_id: str,
    req: GeoFullRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    _validate_source(source_id)
    # Validate column exists
    svc = get_duckdb_service()
    schema = svc.get_schema(source_id)
    known_columns = {c.name for c in schema.columns}
    if req.column not in known_columns:
        raise HTTPException(400, f"Column {req.column!r} not found in source")

    job_id = geo.create_job(
        source_id=source_id,
        column=req.column,
        geo_type=req.geo_type,
    )
    background_tasks.add_task(_run_geocode_full, job_id, source_id, req.column, req.geo_type)
    return GeoFullResponse(job_id=job_id)


@router.get("/sources/{source_id}/geocode-status/{job_id}", response_model=GeoStatusResponse)
def geocode_status(
    source_id: str,
    job_id: str,
    user: dict = Depends(get_current_user),
):
    job = geo.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return GeoStatusResponse(
        status=job.status,
        resolved=job.resolved,
        total=job.total,
        error=job.error,
    )
