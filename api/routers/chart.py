"""
Chart API router - endpoints for chart-first architecture.

Provides:
- Chart conversation endpoints (simplified flow)
- Chart library endpoints (CRUD)
- Dashboard composition endpoints
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.chart import (
    ChartMessageRequest,
    ChartMessageResponse,
    ChartActionButton,
    ChartSchema,
    ChartConfigSchema,
    ChartListResponse,
    ChartCreateRequest,
    ChartCreateResponse,
    DashboardSchema,
    DashboardLayoutSchema,
    DashboardLayoutSection,
    DashboardListResponse,
    DashboardCreateRequest,
    DashboardCreateResponse,
    DashboardAddChartRequest,
    DashboardRemoveChartRequest,
    DashboardReorderChartsRequest,
)
from ..security import get_current_user

# Import engine components
import sys
from pathlib import Path

# Add engine to path
engine_path = Path(__file__).parent.parent.parent / "engine"
sys.path.insert(0, str(engine_path.parent))

from engine.chart_conversation import ChartConversationManager
from engine.chart_pipeline import ChartPipeline, ChartPipelineConfig
from engine.dashboard_composer import DashboardComposer
from engine.models import (
    Chart,
    Dashboard,
    ChartStorage,
    DashboardStorage,
    get_chart_storage,
    get_dashboard_storage,
)
from engine.config import get_config

router = APIRouter(prefix="/charts", tags=["charts"])

# In-memory session storage for chart conversations
# In production, this would be persisted to database
_chart_sessions: dict[str, ChartConversationManager] = {}


def _get_or_create_session(
    session_id: str | None, user: User
) -> tuple[str, ChartConversationManager]:
    """Get existing session or create a new one."""
    if session_id and session_id in _chart_sessions:
        return session_id, _chart_sessions[session_id]

    # Create new session
    new_id = str(uuid.uuid4())
    manager = ChartConversationManager(provider_name=user.preferred_provider)
    _chart_sessions[new_id] = manager
    return new_id, manager


def _chart_to_schema(chart: Chart) -> ChartSchema:
    """Convert engine Chart to API schema."""
    return ChartSchema(
        id=chart.id,
        title=chart.title,
        description=chart.description,
        query_name=chart.query_name,
        sql=chart.sql,
        chart_type=chart.chart_type.value,
        config=ChartConfigSchema(
            x=chart.config.x,
            y=chart.config.y,
            value=chart.config.value,
            series=chart.config.series,
            title=chart.config.title,
            extra_props=chart.config.extra_props,
        ),
        created_at=chart.created_at,
        updated_at=chart.updated_at,
        original_request=chart.original_request,
        is_valid=chart.is_valid,
    )


def _dashboard_to_schema(dashboard: Dashboard) -> DashboardSchema:
    """Convert engine Dashboard to API schema."""
    layout = None
    if dashboard.layout and dashboard.layout.sections:
        layout = DashboardLayoutSchema(
            sections=[
                DashboardLayoutSection(
                    title=s.get("title"),
                    chart_ids=s.get("chart_ids", []),
                )
                for s in dashboard.layout.sections
            ]
        )

    return DashboardSchema(
        id=dashboard.id,
        slug=dashboard.slug,
        title=dashboard.title,
        description=dashboard.description,
        chart_ids=dashboard.chart_ids,
        layout=layout,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


# =============================================================================
# Chart Conversation Endpoints
# =============================================================================


@router.post("/conversation/message", response_model=ChartMessageResponse)
async def send_chart_message(
    request: ChartMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message in a chart conversation.

    This is the simplified chart-first flow:
    1. User describes a chart
    2. System generates it
    3. User can refine or accept
    """
    session_id, manager = _get_or_create_session(request.session_id, current_user)

    try:
        result = manager.process_message(request.message)

        # Convert action buttons
        action_buttons = None
        if result.action_buttons:
            action_buttons = [
                ChartActionButton(
                    id=btn.id,
                    label=btn.label,
                    style=btn.style,
                )
                for btn in result.action_buttons
            ]

        return ChartMessageResponse(
            response=result.response,
            phase=manager.state.phase.value,
            session_id=session_id,
            chart_id=result.chart_id,
            chart_url=result.chart_url,
            chart_title=manager.state.current_chart.spec.title
            if manager.state.current_chart
            else None,
            action_buttons=action_buttons,
            error=result.error,
        )

    except Exception as e:
        return ChartMessageResponse(
            response=f"An error occurred: {str(e)}",
            phase="waiting",
            session_id=session_id,
            error=str(e),
        )


@router.post("/conversation/new", response_model=ChartMessageResponse)
async def new_chart_conversation(
    current_user: User = Depends(get_current_user),
):
    """Start a new chart conversation."""
    session_id = str(uuid.uuid4())
    manager = ChartConversationManager(provider_name=current_user.preferred_provider)
    _chart_sessions[session_id] = manager

    return ChartMessageResponse(
        response="What chart would you like to create? Describe what you want to see.",
        phase="waiting",
        session_id=session_id,
    )


@router.delete("/conversation/{session_id}")
async def delete_chart_conversation(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a chart conversation session."""
    if session_id in _chart_sessions:
        del _chart_sessions[session_id]
        return {"success": True}
    raise HTTPException(status_code=404, detail="Session not found")


# =============================================================================
# Chart Library Endpoints
# =============================================================================


@router.get("/library", response_model=ChartListResponse)
async def list_charts(
    query: str | None = None,
    chart_type: str | None = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """
    List all charts in the library.

    Optional filters:
    - query: Search in title and description
    - chart_type: Filter by chart type
    - limit: Max results (default 50)
    """
    storage = get_chart_storage()
    charts = storage.search(query=query, chart_type=chart_type, limit=limit)

    return ChartListResponse(
        charts=[_chart_to_schema(c) for c in charts],
        total=len(charts),
    )


@router.get("/library/{chart_id}", response_model=ChartSchema)
async def get_chart(
    chart_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a specific chart by ID."""
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    return _chart_to_schema(chart)


@router.delete("/library/{chart_id}")
async def delete_chart(
    chart_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a chart from the library."""
    storage = get_chart_storage()

    if not storage.delete(chart_id):
        raise HTTPException(status_code=404, detail="Chart not found")

    return {"success": True, "deleted_id": chart_id}


@router.post("/library/create", response_model=ChartCreateResponse)
async def create_chart(
    request: ChartCreateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a chart from a natural language request.

    This runs the chart pipeline directly without conversation state.
    """
    pipeline = ChartPipeline(
        ChartPipelineConfig(provider_name=current_user.preferred_provider)
    )

    result = pipeline.run(request.request)

    if not result.success:
        return ChartCreateResponse(
            success=False,
            error=result.error,
        )

    # Store the chart
    storage = get_chart_storage()
    chart = Chart.from_validated(result.chart)
    storage.save(chart)

    # Create preview dashboard
    from engine.dashboard_composer import create_chart_dashboard

    dashboard, file_path = create_chart_dashboard(chart)

    config = get_config()
    chart_url = f"{config.dev_url}/{dashboard.slug}?embed=true"

    return ChartCreateResponse(
        success=True,
        chart=_chart_to_schema(chart),
        chart_url=chart_url,
    )


@router.get("/library/{chart_id}/preview-url")
async def get_chart_preview_url(
    chart_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get the preview URL for a chart (creates dashboard if needed)."""
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    # Create or get existing dashboard for this chart
    from engine.dashboard_composer import create_chart_dashboard

    dashboard, _ = create_chart_dashboard(chart)

    config = get_config()
    return {
        "chart_id": chart_id,
        "url": f"{config.dev_url}/{dashboard.slug}?embed=true",
        "dashboard_slug": dashboard.slug,
    }


# =============================================================================
# Dashboard Composition Endpoints
# =============================================================================


@router.get("/dashboards", response_model=DashboardListResponse)
async def list_dashboards(
    current_user: User = Depends(get_current_user),
):
    """List all composed dashboards."""
    storage = get_dashboard_storage()
    dashboards = storage.list_all()

    return DashboardListResponse(
        dashboards=[_dashboard_to_schema(d) for d in dashboards],
        total=len(dashboards),
    )


@router.get("/dashboards/{dashboard_id}", response_model=DashboardSchema)
async def get_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a specific dashboard by ID."""
    storage = get_dashboard_storage()
    dashboard = storage.get(dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return _dashboard_to_schema(dashboard)


@router.post("/dashboards", response_model=DashboardCreateResponse)
async def create_dashboard(
    request: DashboardCreateRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a new dashboard."""
    composer = DashboardComposer()

    try:
        dashboard = composer.create_dashboard(
            title=request.title,
            description=request.description,
            chart_ids=request.chart_ids,
        )

        # Write to Evidence pages
        file_path = composer.write_dashboard(dashboard)

        config = get_config()
        dashboard_url = f"{config.dev_url}/{dashboard.slug}"

        return DashboardCreateResponse(
            success=True,
            dashboard=_dashboard_to_schema(dashboard),
            dashboard_url=dashboard_url,
        )

    except Exception as e:
        return DashboardCreateResponse(
            success=False,
            error=str(e),
        )


@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a dashboard."""
    storage = get_dashboard_storage()

    if not storage.delete(dashboard_id):
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return {"success": True, "deleted_id": dashboard_id}


@router.post("/dashboards/{dashboard_id}/charts", response_model=DashboardSchema)
async def add_chart_to_dashboard(
    dashboard_id: str,
    request: DashboardAddChartRequest,
    current_user: User = Depends(get_current_user),
):
    """Add a chart to a dashboard."""
    composer = DashboardComposer()

    dashboard = composer.add_chart_to_dashboard(
        dashboard_id=dashboard_id,
        chart_id=request.chart_id,
        section=request.section,
    )

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Regenerate the Evidence markdown
    composer.write_dashboard(dashboard)

    return _dashboard_to_schema(dashboard)


@router.delete("/dashboards/{dashboard_id}/charts/{chart_id}", response_model=DashboardSchema)
async def remove_chart_from_dashboard(
    dashboard_id: str,
    chart_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a chart from a dashboard."""
    composer = DashboardComposer()

    dashboard = composer.remove_chart_from_dashboard(
        dashboard_id=dashboard_id,
        chart_id=chart_id,
    )

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Regenerate the Evidence markdown
    composer.write_dashboard(dashboard)

    return _dashboard_to_schema(dashboard)


@router.put("/dashboards/{dashboard_id}/reorder", response_model=DashboardSchema)
async def reorder_dashboard_charts(
    dashboard_id: str,
    request: DashboardReorderChartsRequest,
    current_user: User = Depends(get_current_user),
):
    """Reorder charts in a dashboard."""
    composer = DashboardComposer()

    dashboard = composer.reorder_charts(
        dashboard_id=dashboard_id,
        chart_ids=request.chart_ids,
    )

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Regenerate the Evidence markdown
    composer.write_dashboard(dashboard)

    return _dashboard_to_schema(dashboard)


@router.post("/dashboards/{dashboard_id}/publish")
async def publish_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
):
    """Publish/write a dashboard to Evidence pages."""
    storage = get_dashboard_storage()
    dashboard = storage.get(dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    composer = DashboardComposer()
    file_path = composer.write_dashboard(dashboard)

    config = get_config()

    return {
        "success": True,
        "dashboard_id": dashboard_id,
        "slug": dashboard.slug,
        "url": f"{config.dev_url}/{dashboard.slug}",
        "embed_url": f"{config.dev_url}/{dashboard.slug}?embed=true",
        "file_path": str(file_path),
    }
