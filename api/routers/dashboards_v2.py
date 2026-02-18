"""
Dashboards v2 router: create, list, get, update, delete dashboards.
A dashboard is an ordered collection of chart references rendered in a grid.
"""

from __future__ import annotations

import difflib
import re
import threading
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from fastapi.responses import HTMLResponse

from ..services.dashboard_storage import (
    save_dashboard, load_dashboard, list_dashboards,
    update_dashboard, delete_dashboard,
)
from ..services.chart_storage import load_chart
from ..services.duckdb_service import get_duckdb_service
from ..services.static_export import export_dashboard_html
from ..services.metadata_db import (
    get_dashboard_meta, set_dashboard_meta, update_dashboard_visibility,
)


router = APIRouter(prefix="/v2/dashboards", tags=["dashboards-v2"])


# ── Request / Response Schemas ───────────────────────────────────────────────

class ChartRefSchema(BaseModel):
    chart_id: str
    width: str = "half"  # "full" or "half"
    layout: dict | None = None  # {x, y, w, h} grid position


class FilterSpecSchema(BaseModel):
    name: str
    filterType: str
    title: str | None = None
    optionsColumn: str | None = None
    optionsSourceId: str | None = None
    optionsQuery: str | None = None
    dateColumn: str | None = None
    defaultStart: str | None = None
    defaultEnd: str | None = None
    minValue: float | None = None
    maxValue: float | None = None
    step: float | None = None
    defaultValue: str | None = None


class CreateDashboardRequest(BaseModel):
    title: str
    description: str | None = None
    charts: list[ChartRefSchema] = []
    filters: list[FilterSpecSchema] = []


class UpdateDashboardRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    charts: list[ChartRefSchema] | None = None
    filters: list[FilterSpecSchema] | None = None


class FilterQueryRequest(BaseModel):
    """Request body for re-querying dashboard charts with filter params."""
    params: dict[str, str | int | float] = {}


class DashboardResponse(BaseModel):
    id: str
    title: str
    description: str | None
    charts: list[dict]
    filters: list[dict] = []
    created_at: str
    updated_at: str


class ChartWithData(BaseModel):
    chart_id: str
    width: str
    chart_type: str
    title: str | None
    subtitle: str | None
    source: str | None
    x: str | None
    y: str | list[str] | None
    series: str | None
    horizontal: bool
    sort: bool
    config: dict | None
    data: list[dict]
    columns: list[str]
    error: str | None = None
    # 11.2: Data freshness
    data_ingested_at: str | None = None
    freshness: str | None = None
    # 11.3: Schema change detection
    error_type: str | None = None
    error_suggestion: str | None = None
    # 11.4: Health status
    health_status: str = "healthy"
    health_issues: list[str] = []
    # Grid layout position
    layout: dict | None = None


class DashboardWithDataResponse(BaseModel):
    id: str
    title: str
    description: str | None
    charts: list[ChartWithData]
    filters: list[dict] = []
    created_at: str
    updated_at: str
    has_stale_data: bool = False


class ChartHealthResult(BaseModel):
    chart_id: str
    health_status: str
    health_issues: list[str]


class HealthCheckResponse(BaseModel):
    dashboard_id: str
    checked_at: str
    charts: list[ChartHealthResult]
    overall_status: str


# ── Helpers ─────────────────────────────────────────────────────────────────

def _compute_freshness(ingested_at: datetime | None) -> str | None:
    """Compute freshness bucket from ingestion timestamp."""
    if ingested_at is None:
        return None
    age_hours = (datetime.now(timezone.utc) - ingested_at).total_seconds() / 3600
    if age_hours < 1:
        return "fresh"
    elif age_hours < 24:
        return "aging"
    else:
        return "stale"


_SCHEMA_CHANGE_PATTERNS = [
    re.compile(r'does not have a column with name "([^"]+)"', re.IGNORECASE),
    re.compile(r'Referenced column "([^"]+)" not found', re.IGNORECASE),
    re.compile(r'column "([^"]+)" (?:not found|does not exist)', re.IGNORECASE),
    re.compile(r'Binder Error:.*"([^"]+)".*not found', re.IGNORECASE),
]

_SOURCE_MISSING_PATTERNS = [
    re.compile(r'Table .* does not exist', re.IGNORECASE),
    re.compile(r'Catalog Error:.*Table.*not found', re.IGNORECASE),
]


def _classify_sql_error(
    error_str: str,
    source_id: str | None,
) -> tuple[str, str, str | None]:
    """Classify a DuckDB error into (error_message, error_type, error_suggestion).

    Returns:
        (error_message, error_type, error_suggestion) where error_type is one of
        "schema_change", "source_missing", or "sql_error".
    """
    db = get_duckdb_service()

    # Check schema change patterns
    for pattern in _SCHEMA_CHANGE_PATTERNS:
        match = pattern.search(error_str)
        if match:
            missing_col = match.group(1)
            suggestion = None
            if source_id:
                try:
                    schema = db.get_schema(source_id)
                    current_cols = [c.name for c in schema.columns]
                    close = difflib.get_close_matches(missing_col, current_cols, n=3, cutoff=0.4)
                    if close:
                        suggestion = f'Column "{missing_col}" no longer exists. Did you mean: {", ".join(close)}?'
                    else:
                        suggestion = (
                            f'Column "{missing_col}" no longer exists. '
                            f"Available columns: {', '.join(current_cols[:10])}"
                        )
                except Exception:
                    suggestion = f'Column "{missing_col}" no longer exists.'
            return (f"SQL execution failed: {error_str}", "schema_change", suggestion)

    # Check source missing patterns
    for pattern in _SOURCE_MISSING_PATTERNS:
        if pattern.search(error_str):
            return (
                f"SQL execution failed: {error_str}",
                "source_missing",
                "The data source may need to be re-uploaded or reconnected.",
            )

    # Generic SQL error
    return (f"SQL execution failed: {error_str}", "sql_error", None)


def _compute_health_status(
    error: str | None,
    error_type: str | None,
    freshness: str | None,
    row_count: int,
) -> tuple[str, list[str]]:
    """Compute health status and issues list from chart state.

    Returns:
        (health_status, health_issues) where health_status is one of
        "healthy", "warning", or "error".
    """
    issues: list[str] = []

    if error:
        if error_type in ("schema_change", "source_missing"):
            issues.append(f"Error: {error_type.replace('_', ' ')}")
        else:
            issues.append("SQL execution error")
        return ("error", issues)

    if freshness == "stale":
        issues.append("Data is more than 24 hours old")
    if row_count == 0:
        issues.append("Query returned 0 rows")

    if issues:
        return ("warning", issues)

    return ("healthy", [])


# ── Health check cache (bounded LRU) ───────────────────────────────────────

_HEALTH_CACHE_MAX = 100
_health_cache: dict[str, HealthCheckResponse] = {}
_health_cache_lock = threading.Lock()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=DashboardResponse)
async def create(request: CreateDashboardRequest):
    """Create a new dashboard."""
    charts_dicts = [c.model_dump() for c in request.charts]
    filters_dicts = [f.model_dump(exclude_none=True) for f in request.filters]
    dashboard = save_dashboard(
        title=request.title,
        description=request.description,
        charts=charts_dicts,
        filters=filters_dicts or None,
    )
    return DashboardResponse(
        id=dashboard.id,
        title=dashboard.title,
        description=dashboard.description,
        charts=dashboard.charts,
        filters=dashboard.filters or [],
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


@router.get("/", response_model=list[DashboardResponse])
async def list_all():
    """List all dashboards."""
    dashboards = list_dashboards()
    return [
        DashboardResponse(
            id=d.id,
            title=d.title,
            description=d.description,
            charts=d.charts,
            filters=d.filters or [],
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in dashboards
    ]


@router.get("/{dashboard_id}", response_model=DashboardWithDataResponse)
async def get_dashboard(dashboard_id: str, filters: str | None = None):
    """Get a dashboard with all chart data (re-executes SQL for each chart).

    Args:
        dashboard_id: The dashboard to load.
        filters: Optional JSON-encoded dict of filter params ({name: value}).
    """
    dashboard = load_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Parse filter params from query string
    import json as _json
    filter_params: dict[str, str | int | float] = {}
    if filters:
        try:
            parsed = _json.loads(filters)
            if not isinstance(parsed, dict):
                raise HTTPException(status_code=400, detail="filters must be a JSON object")
            filter_params = parsed
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="filters must be valid JSON")

    db = get_duckdb_service()
    charts_with_data: list[ChartWithData] = []
    any_stale = False

    for ref in dashboard.charts:
        chart_id = ref.get("chart_id", "")
        width = ref.get("width", "half")
        layout = ref.get("layout")

        chart = load_chart(chart_id)
        if not chart:
            charts_with_data.append(ChartWithData(
                chart_id=chart_id,
                width=width,
                chart_type="BarChart",
                title=None, subtitle=None, source=None,
                x=None, y=None, series=None,
                horizontal=False, sort=True, config=None,
                data=[], columns=[],
                error=f"Chart {chart_id} not found",
                error_type="chart_not_found",
                health_status="error",
                health_issues=[f"Chart {chart_id} not found"],
                layout=layout,
            ))
            continue

        data: list[dict] = []
        columns: list[str] = []
        error: str | None = None
        error_type: str | None = None
        error_suggestion: str | None = None

        if chart.sql:
            try:
                result = db.execute_query(chart.sql, chart.source_id, params=filter_params or None)
                data = result.rows
                columns = result.columns
            except Exception as e:
                traceback.print_exc()
                error, error_type, error_suggestion = _classify_sql_error(
                    str(e), chart.source_id
                )

        # Freshness — CSV uploads are static data, never stale
        ingested_at = db.get_ingested_at(chart.source_id)
        ingested_at_iso = ingested_at.isoformat() if ingested_at else None
        is_csv = db.is_csv_source(chart.source_id)
        freshness = "fresh" if is_csv else _compute_freshness(ingested_at)
        if freshness == "stale":
            any_stale = True

        # Health
        row_count = len(data)
        health_status, health_issues = _compute_health_status(
            error, error_type, freshness, row_count
        )

        charts_with_data.append(ChartWithData(
            chart_id=chart.id,
            width=width,
            chart_type=chart.chart_type,
            title=chart.title,
            subtitle=chart.subtitle,
            source=chart.source,
            x=chart.x,
            y=chart.y,
            series=chart.series,
            horizontal=chart.horizontal,
            sort=chart.sort,
            config=chart.config,
            data=data,
            columns=columns,
            error=error,
            data_ingested_at=ingested_at_iso,
            freshness=freshness,
            error_type=error_type,
            error_suggestion=error_suggestion,
            health_status=health_status,
            health_issues=health_issues,
            layout=layout,
        ))

    return DashboardWithDataResponse(
        id=dashboard.id,
        title=dashboard.title,
        description=dashboard.description,
        charts=charts_with_data,
        filters=dashboard.filters or [],
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
        has_stale_data=any_stale,
    )


@router.post("/{dashboard_id}/health-check", response_model=HealthCheckResponse)
async def run_health_check(dashboard_id: str):
    """Run data-level health checks for all charts in a dashboard."""
    # Re-use get_dashboard; its 404 propagates with correct status
    try:
        dashboard_data = await get_dashboard(dashboard_id)
    except HTTPException:
        raise  # Preserve 404 from get_dashboard

    chart_results: list[ChartHealthResult] = []
    worst_status = "healthy"

    for chart in dashboard_data.charts:
        chart_results.append(ChartHealthResult(
            chart_id=chart.chart_id,
            health_status=chart.health_status,
            health_issues=chart.health_issues,
        ))
        if chart.health_status == "error":
            worst_status = "error"
        elif chart.health_status == "warning" and worst_status != "error":
            worst_status = "warning"

    result = HealthCheckResponse(
        dashboard_id=dashboard_id,
        checked_at=datetime.now(timezone.utc).isoformat(),
        charts=chart_results,
        overall_status=worst_status,
    )

    # Evict oldest entries if cache exceeds max size (only when inserting new key)
    with _health_cache_lock:
        if dashboard_id not in _health_cache and len(_health_cache) >= _HEALTH_CACHE_MAX:
            oldest_key = next(iter(_health_cache))
            del _health_cache[oldest_key]
        _health_cache[dashboard_id] = result
    return result


@router.get("/{dashboard_id}/health", response_model=HealthCheckResponse)
async def get_health(dashboard_id: str):
    """Get cached health check results (without re-running checks)."""
    with _health_cache_lock:
        cached = _health_cache.get(dashboard_id)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="No health check results found. Run POST /health-check first.",
        )
    return cached


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update(dashboard_id: str, request: UpdateDashboardRequest):
    """Update a dashboard."""
    raw = request.model_dump(exclude_unset=True)
    fields: dict = {}
    for key, value in raw.items():
        if key == "charts" and value is not None:
            fields["charts"] = value  # already list[dict] from model_dump
        elif key == "filters" and value is not None:
            # Re-serialize from Pydantic to exclude None values in filter specs
            fields["filters"] = [f.model_dump(exclude_none=True) for f in request.filters]  # type: ignore[union-attr]
        else:
            fields[key] = value

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    dashboard = update_dashboard(dashboard_id, **fields)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return DashboardResponse(
        id=dashboard.id,
        title=dashboard.title,
        description=dashboard.description,
        charts=dashboard.charts,
        filters=dashboard.filters or [],
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


@router.get("/{dashboard_id}/export/html")
async def export_html(dashboard_id: str):
    """Export a dashboard as a self-contained HTML file."""
    try:
        dashboard_data = await get_dashboard(dashboard_id)
    except HTTPException:
        raise  # Preserve 404 from get_dashboard

    charts_for_export = []
    for chart in dashboard_data.charts:
        charts_for_export.append({
            "chart_id": chart.chart_id,
            "chart_type": chart.chart_type,
            "title": chart.title,
            "subtitle": chart.subtitle,
            "source": chart.source,
            "width": chart.width,
            "config": {
                "x": chart.x,
                "y": chart.y,
                "series": chart.series,
                "horizontal": chart.horizontal,
                "sort": chart.sort,
                **(chart.config or {}),
            },
            "data": chart.data,
        })

    html = export_dashboard_html(
        title=dashboard_data.title,
        charts=charts_for_export,
    )

    # Sanitize filename: strip anything outside alphanumeric, underscore, hyphen
    safe_title = re.sub(r'[^\w\-]', '_', dashboard_data.title).strip('_').lower()
    if not safe_title:
        safe_title = "dashboard"
    filename = f"{safe_title}.html"
    return HTMLResponse(
        content=html,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.delete("/{dashboard_id}")
async def remove_dashboard(dashboard_id: str):
    """Delete a dashboard."""
    if not delete_dashboard(dashboard_id):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"deleted": True}


# ── Sharing Endpoints ────────────────────────────────────────────────────────


class SharingResponse(BaseModel):
    dashboard_id: str
    visibility: str


class UpdateSharingRequest(BaseModel):
    visibility: str  # "private", "team", "public"


@router.get("/{dashboard_id}/sharing", response_model=SharingResponse)
async def get_sharing(dashboard_id: str):
    """Get dashboard sharing/visibility settings."""
    meta = get_dashboard_meta(dashboard_id)
    return SharingResponse(
        dashboard_id=dashboard_id,
        visibility=meta["visibility"] if meta else "private",
    )


@router.put("/{dashboard_id}/sharing", response_model=SharingResponse)
async def update_sharing(dashboard_id: str, request: UpdateSharingRequest):
    """Update dashboard visibility."""
    if request.visibility not in ("private", "team", "public"):
        raise HTTPException(status_code=400, detail="Invalid visibility. Use: private, team, public")

    # Verify the dashboard exists before creating/updating metadata
    dashboard = load_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    meta = get_dashboard_meta(dashboard_id)
    if not meta:
        # Create metadata with default owner
        from ..services.metadata_db import DEFAULT_USER_ID
        set_dashboard_meta(dashboard_id, DEFAULT_USER_ID, request.visibility)
    else:
        update_dashboard_visibility(dashboard_id, request.visibility)

    return SharingResponse(
        dashboard_id=dashboard_id,
        visibility=request.visibility,
    )
