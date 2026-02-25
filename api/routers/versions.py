"""
Version history router: create, list, restore, and delete chart version snapshots.
Versions are complete point-in-time copies of chart state.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.chart_storage import load_chart, update_chart, _validate_id
from ..services.version_storage import (
    create_version,
    list_versions,
    get_version,
    delete_version,
)

router = APIRouter(prefix="/v2/charts", tags=["versions"])


# ── Request / Response Schemas ───────────────────────────────────────────────


class CreateVersionRequest(BaseModel):
    trigger: str = Field("manual", examples=["auto", "manual", "publish"])
    label: str | None = Field(None, examples=["Before major redesign"])


class VersionMetaResponse(BaseModel):
    version: int
    created_at: str
    trigger: str
    label: str | None = None


class VersionDetailResponse(BaseModel):
    version: int
    created_at: str
    trigger: str
    label: str | None = None
    chart_data: dict


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/{chart_id}/versions", response_model=VersionMetaResponse)
async def create_chart_version(chart_id: str, request: CreateVersionRequest):
    """Create a version snapshot of the current chart state."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")

    chart = load_chart(chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    chart_data = asdict(chart)
    meta = create_version(
        chart_id=chart_id,
        chart_data=chart_data,
        trigger=request.trigger,
        label=request.label,
    )

    return VersionMetaResponse(**meta)


@router.get("/{chart_id}/versions", response_model=list[VersionMetaResponse])
async def list_chart_versions(chart_id: str):
    """List all version snapshots for a chart, newest first."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")

    versions = list_versions(chart_id)
    return [VersionMetaResponse(**v) for v in versions]


@router.get("/{chart_id}/versions/{version}", response_model=VersionDetailResponse)
async def get_chart_version(chart_id: str, version: int):
    """Get the full content of a specific version."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")

    snapshot = get_version(chart_id, version)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Version not found")

    meta = snapshot.pop("_version_meta", {})
    return VersionDetailResponse(
        version=meta.get("version", version),
        created_at=meta.get("created_at", ""),
        trigger=meta.get("trigger", "unknown"),
        label=meta.get("label"),
        chart_data=snapshot,
    )


@router.post("/{chart_id}/versions/{version}/restore")
async def restore_chart_version(chart_id: str, version: int):
    """Restore a chart to a specific version's state."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")

    # Verify the chart still exists
    current = load_chart(chart_id)
    if not current:
        raise HTTPException(status_code=404, detail="Chart not found")

    snapshot = get_version(chart_id, version)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Version not found")

    # Remove version metadata from the snapshot before restoring
    snapshot.pop("_version_meta", None)

    # Create a version of the current state before restoring (safety net)
    from dataclasses import asdict as _asdict
    create_version(
        chart_id=chart_id,
        chart_data=_asdict(current),
        trigger="auto",
        label=f"Before restore to v{version}",
    )

    # Apply the versioned fields to the chart via update_chart
    # update_chart only allows certain fields — extract those
    _RESTORABLE = {
        "chart_type", "title", "subtitle", "source", "x", "y", "series",
        "horizontal", "sort", "reasoning", "config", "connection_id",
        "source_table", "status", "folder_id",
    }
    restore_fields = {k: v for k, v in snapshot.items() if k in _RESTORABLE}

    updated = update_chart(chart_id, **restore_fields)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to restore chart")

    return {"restored": True, "version": version, "chart_id": chart_id}


@router.delete("/{chart_id}/versions/{version}")
async def delete_chart_version(chart_id: str, version: int):
    """Delete a specific version snapshot."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")

    if not delete_version(chart_id, version):
        raise HTTPException(status_code=404, detail="Version not found")

    return {"deleted": True}
