"""
Dashboards v2 router: create, list, get, update, delete dashboards.
A dashboard is an ordered collection of chart references rendered in a grid.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.dashboard_storage import (
    save_dashboard, load_dashboard, list_dashboards,
    update_dashboard, delete_dashboard,
)
from ..services.chart_storage import load_chart
from ..services.duckdb_service import get_duckdb_service


router = APIRouter(prefix="/v2/dashboards", tags=["dashboards-v2"])


# ── Request / Response Schemas ───────────────────────────────────────────────

class ChartRefSchema(BaseModel):
    chart_id: str
    width: str = "half"  # "full" or "half"


class CreateDashboardRequest(BaseModel):
    title: str
    description: str | None = None
    charts: list[ChartRefSchema] = []


class UpdateDashboardRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    charts: list[ChartRefSchema] | None = None


class DashboardResponse(BaseModel):
    id: str
    title: str
    description: str | None
    charts: list[dict]
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
    y: str | None
    series: str | None
    horizontal: bool
    sort: bool
    config: dict | None
    data: list[dict]
    columns: list[str]
    error: str | None = None


class DashboardWithDataResponse(BaseModel):
    id: str
    title: str
    description: str | None
    charts: list[ChartWithData]
    created_at: str
    updated_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=DashboardResponse)
async def create(request: CreateDashboardRequest):
    """Create a new dashboard."""
    charts_dicts = [c.model_dump() for c in request.charts]
    dashboard = save_dashboard(
        title=request.title,
        description=request.description,
        charts=charts_dicts,
    )
    return DashboardResponse(
        id=dashboard.id,
        title=dashboard.title,
        description=dashboard.description,
        charts=dashboard.charts,
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
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in dashboards
    ]


@router.get("/{dashboard_id}", response_model=DashboardWithDataResponse)
async def get_dashboard(dashboard_id: str):
    """Get a dashboard with all chart data (re-executes SQL for each chart)."""
    dashboard = load_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    db = get_duckdb_service()
    charts_with_data: list[ChartWithData] = []

    for ref in dashboard.charts:
        chart_id = ref.get("chart_id", "")
        width = ref.get("width", "half")

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
            ))
            continue

        data: list[dict] = []
        columns: list[str] = []
        error: str | None = None

        if chart.sql:
            try:
                result = db.execute_query(chart.sql, chart.source_id)
                data = result.rows
                columns = result.columns
            except Exception as e:
                traceback.print_exc()
                error = f"SQL execution failed: {e}"

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
        ))

    return DashboardWithDataResponse(
        id=dashboard.id,
        title=dashboard.title,
        description=dashboard.description,
        charts=charts_with_data,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update(dashboard_id: str, request: UpdateDashboardRequest):
    """Update a dashboard."""
    fields: dict = {}
    if request.title is not None:
        fields["title"] = request.title
    if request.description is not None:
        fields["description"] = request.description
    if request.charts is not None:
        fields["charts"] = [c.model_dump() for c in request.charts]

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
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


@router.delete("/{dashboard_id}")
async def remove_dashboard(dashboard_id: str):
    """Delete a dashboard."""
    if not delete_dashboard(dashboard_id):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"deleted": True}
