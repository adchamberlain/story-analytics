"""
Settings router: LLM provider configuration and data sources overview.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.settings_storage import load_settings, save_settings, mask_key
from ..services.duckdb_service import get_duckdb_service
from ..services.connection_service import list_connections


router = APIRouter(prefix="/settings", tags=["settings"])


# ── Request / Response Schemas ───────────────────────────────────────────────

class SettingsResponse(BaseModel):
    ai_provider: str
    anthropic_api_key: str
    openai_api_key: str
    google_api_key: str
    updated_at: str


class UpdateSettingsRequest(BaseModel):
    ai_provider: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None


class DataSourceInfo(BaseModel):
    source_id: str
    name: str
    type: str  # "csv" | "snowflake" | "postgres" | ...
    row_count: int
    column_count: int


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=SettingsResponse)
async def get_settings():
    """Return current settings with API keys masked."""
    s = load_settings()
    return SettingsResponse(
        ai_provider=s.ai_provider,
        anthropic_api_key=mask_key(s.anthropic_api_key),
        openai_api_key=mask_key(s.openai_api_key),
        google_api_key=mask_key(s.google_api_key),
        updated_at=s.updated_at,
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(request: UpdateSettingsRequest):
    """Update provider and/or API keys. Returns masked keys."""
    fields = {k: v for k, v in request.model_dump().items() if v is not None}
    # Never accept masked keys back — they'd overwrite the real key
    for key in list(fields):
        if key.endswith("_api_key") and isinstance(fields[key], str) and fields[key].endswith("****"):
            del fields[key]
    s = save_settings(**fields)
    return SettingsResponse(
        ai_provider=s.ai_provider,
        anthropic_api_key=mask_key(s.anthropic_api_key),
        openai_api_key=mask_key(s.openai_api_key),
        google_api_key=mask_key(s.google_api_key),
        updated_at=s.updated_at,
    )


@router.get("/sources", response_model=list[DataSourceInfo])
async def list_data_sources():
    """List all data sources: database connections first, then CSVs (most recent first)."""
    connections: list[DataSourceInfo] = []
    csvs: list[tuple[float, DataSourceInfo]] = []

    # Uploaded CSVs from DuckDB service
    db = get_duckdb_service()
    for source_id in list(db._sources.keys()):
        try:
            schema = db.get_schema(source_id)
            ingested_at = db.get_ingested_at(source_id)
            ts = ingested_at.timestamp() if ingested_at else 0.0
            csvs.append((ts, DataSourceInfo(
                source_id=source_id,
                name=schema.filename,
                type="csv",
                row_count=schema.row_count,
                column_count=len(schema.columns),
            )))
        except Exception:
            continue

    # Database connections
    for conn in list_connections():
        connections.append(DataSourceInfo(
            source_id=conn.connection_id,
            name=conn.name,
            type=conn.db_type,
            row_count=0,
            column_count=0,
        ))

    # Sort CSVs by ingested_at descending (most recent first)
    csvs.sort(key=lambda x: x[0], reverse=True)

    return connections + [info for _, info in csvs]
