"""
Render API router - endpoints for React frontend chart rendering.

Provides:
- Chart render data (spec + executed query data)
- Query execution for filter changes
- Dashboard render data
"""

from typing import Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from ..dependencies import get_current_user
from ..models.user import User

# Optional auth for development - allows unauthenticated access to read-only endpoints
security = HTTPBearer(auto_error=False)


async def optional_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> bool:
    """
    Optional authentication for render endpoints.
    In development, allows unauthenticated access to read-only endpoints.
    Returns True if authenticated, False otherwise.
    """
    # For now, allow all requests in development
    # TODO: Add proper auth check for production
    return True

# Import engine components
import sys

engine_path = Path(__file__).parent.parent.parent / "engine"
sys.path.insert(0, str(engine_path.parent))

from engine.models import (
    get_chart_storage,
    get_dashboard_storage,
)
from engine.sql_validator import SQLValidator

router = APIRouter(prefix="/render", tags=["render"])


class ExecuteQueryRequest(BaseModel):
    """Request to execute a SQL query with optional filter values."""
    sql: str
    filters: dict[str, Any] | None = None


class ExecuteQueryResponse(BaseModel):
    """Response with query results."""
    data: list[dict[str, Any]]
    columns: list[str]


class ChartRenderData(BaseModel):
    """Complete data needed to render a chart."""
    spec: dict[str, Any]
    data: list[dict[str, Any]]
    columns: list[str]
    plotlyConfig: dict[str, Any] | None = None


class DashboardRenderData(BaseModel):
    """Complete data needed to render a dashboard."""
    dashboard: dict[str, Any]
    charts: list[ChartRenderData]


def _execute_sql(sql: str, filters: dict[str, Any] | None = None) -> tuple[list[dict], list[str]]:
    """
    Execute SQL query and return results.

    Uses the SQLValidator's DuckDB connection to execute queries.
    Applies filter substitutions if provided.
    """
    # Apply filter substitutions
    processed_sql = sql
    if filters:
        for name, value in filters.items():
            # Handle different filter value types
            if isinstance(value, dict) and "start" in value and "end" in value:
                # Date range filter
                processed_sql = processed_sql.replace(f"${{inputs.{name}.start}}", f"'{value['start']}'")
                processed_sql = processed_sql.replace(f"${{inputs.{name}.end}}", f"'{value['end']}'")
            else:
                # Simple value filter
                str_value = str(value)
                # Handle numeric vs string values
                try:
                    float(str_value)
                    processed_sql = processed_sql.replace(f"${{inputs.{name}}}", str_value)
                except ValueError:
                    processed_sql = processed_sql.replace(f"${{inputs.{name}}}", f"'{str_value}'")

    # Get DuckDB connection from SQLValidator
    validator = SQLValidator()
    conn = validator._get_connection()

    try:
        result = conn.execute(processed_sql).fetchdf()

        # Convert DataFrame to list of dicts
        data = result.to_dict(orient="records")
        columns = list(result.columns)

        return data, columns
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")


def _chart_to_render_spec(chart) -> dict[str, Any]:
    """Convert Chart model to render spec dict."""
    return {
        "chartType": chart.chart_type.value,
        "queryName": chart.query_name,
        "sql": chart.sql,
        "config": {
            "x": chart.config.x,
            "y": chart.config.y,
            "y2": chart.config.y2,
            "value": chart.config.value,
            "series": chart.config.series,
            "title": chart.config.title,
            "xAxisTitle": chart.config.x_axis_title,
            "yAxisTitle": chart.config.y_axis_title,
            "horizontal": chart.config.horizontal,
            "stacked": chart.config.stacked,
            "color": chart.config.color,
            "fillColor": chart.config.fill_color,
            "extraProps": chart.config.extra_props,
        },
        "filters": [
            {
                "name": f.name,
                "filterType": f.filter_type.value,
                "title": f.title,
                "optionsColumn": f.options_column,
                "optionsTable": f.options_table,
                "optionsQuery": f.options_query,
                "dateColumn": f.date_column,
                "defaultValue": f.default_value,
            }
            for f in chart.filters
        ] if chart.filters else [],
    }


@router.get("/chart/{chart_id}", response_model=ChartRenderData)
async def get_chart_render_data(
    chart_id: str,
    _auth: bool = Depends(optional_auth),
):
    """
    Get complete render data for a chart.

    Returns the chart spec, executed query data, and Plotly configuration.
    Note: Auth is optional for development/testing.
    """
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    # Execute the query
    try:
        data, columns = _execute_sql(chart.sql)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute query: {str(e)}")

    # Build render spec
    spec = _chart_to_render_spec(chart)

    return ChartRenderData(
        spec=spec,
        data=data,
        columns=columns,
        plotlyConfig={
            "responsive": True,
            "displayModeBar": "hover",
            "displaylogo": False,
        },
    )


@router.post("/execute-query", response_model=ExecuteQueryResponse)
async def execute_query(
    request: ExecuteQueryRequest,
    _auth: bool = Depends(optional_auth),
):
    """
    Execute a SQL query with optional filter values.

    Used when filters change to refresh chart data without reloading the full spec.
    Note: Auth is optional for development/testing.
    """
    try:
        data, columns = _execute_sql(request.sql, request.filters)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute query: {str(e)}")

    return ExecuteQueryResponse(data=data, columns=columns)


@router.get("/dashboard/{slug}", response_model=DashboardRenderData)
async def get_dashboard_render_data(
    slug: str,
    _auth: bool = Depends(optional_auth),
):
    """
    Get complete render data for a dashboard.

    Returns the dashboard layout and render data for all charts.
    Note: Auth is optional for development/testing.
    """
    dashboard_storage = get_dashboard_storage()
    dashboard = dashboard_storage.get_by_slug(slug)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    chart_storage = get_chart_storage()
    charts_data = []

    for chart_id in dashboard.chart_ids:
        chart = chart_storage.get(chart_id)
        if not chart:
            continue

        try:
            data, columns = _execute_sql(chart.sql)
            spec = _chart_to_render_spec(chart)

            charts_data.append(ChartRenderData(
                spec=spec,
                data=data,
                columns=columns,
                plotlyConfig={
                    "responsive": True,
                    "displayModeBar": "hover",
                    "displaylogo": False,
                },
            ))
        except Exception as e:
            # Log error but continue with other charts
            print(f"Failed to load chart {chart_id}: {e}")
            continue

    return DashboardRenderData(
        dashboard={
            "id": dashboard.id,
            "slug": dashboard.slug,
            "title": dashboard.title,
            "description": dashboard.description,
            "chartIds": dashboard.chart_ids,
            "layout": {
                "sections": dashboard.layout.sections if dashboard.layout else [],
            },
            "createdAt": dashboard.created_at.isoformat() if dashboard.created_at else None,
            "updatedAt": dashboard.updated_at.isoformat() if dashboard.updated_at else None,
        },
        charts=charts_data,
    )


@router.get("/chart-by-slug/{slug}", response_model=ChartRenderData)
async def get_chart_render_data_by_slug(
    slug: str,
    _auth: bool = Depends(optional_auth),
):
    """
    Get chart render data by dashboard slug (for single-chart pages).

    This is useful when we have a URL slug but not the chart ID directly.
    """
    dashboard_storage = get_dashboard_storage()
    dashboard = dashboard_storage.get_by_slug(slug)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Page not found")

    if not dashboard.chart_ids or len(dashboard.chart_ids) == 0:
        raise HTTPException(status_code=404, detail="No charts in this page")

    # For single-chart dashboards, return the first chart
    chart_storage = get_chart_storage()
    chart = chart_storage.get(dashboard.chart_ids[0])

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    try:
        data, columns = _execute_sql(chart.sql)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute query: {str(e)}")

    spec = _chart_to_render_spec(chart)

    return ChartRenderData(
        spec=spec,
        data=data,
        columns=columns,
        plotlyConfig={
            "responsive": True,
            "displayModeBar": "hover",
            "displaylogo": False,
        },
    )
