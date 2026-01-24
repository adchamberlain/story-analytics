"""
Chart API router - endpoints for chart-first architecture.

Provides:
- Chart conversation endpoints (simplified flow)
- Chart library endpoints (CRUD)
- Dashboard composition endpoints
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models.user import User
from ..models.session import ConversationSession
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
from ..dependencies import get_current_user

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

# In-memory cache for active chart conversation managers
# Key is session_id (int), value is the manager
_chart_managers: dict[int, ChartConversationManager] = {}


def _get_or_create_chart_session(
    db: DBSession, user: User, session_id: int | None
) -> tuple[ConversationSession, ChartConversationManager]:
    """Get existing chart session or create a new one."""
    if session_id:
        # Get existing session
        session = (
            db.query(ConversationSession)
            .filter(
                ConversationSession.id == session_id,
                ConversationSession.user_id == user.id,
                ConversationSession.conversation_type == "chart",
            )
            .first()
        )
        if session:
            # Get or create manager for this session
            if session_id in _chart_managers:
                manager = _chart_managers[session_id]
            else:
                manager = ChartConversationManager(provider_name=user.preferred_provider)
                _restore_chart_manager_state(manager, session)
                _chart_managers[session_id] = manager
            return session, manager

    # Create new session
    session = ConversationSession(
        user_id=user.id,
        messages=[],
        phase="waiting",
        conversation_type="chart",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    manager = ChartConversationManager(provider_name=user.preferred_provider)
    _chart_managers[session.id] = manager
    return session, manager


def _restore_chart_manager_state(manager: ChartConversationManager, session: ConversationSession):
    """Restore chart manager state from database session."""
    from engine.chart_conversation import ChartPhase
    from engine.llm.base import Message

    # Restore messages
    manager.state.messages = [
        Message(role=m["role"], content=m["content"]) for m in (session.messages or [])
    ]

    # Restore phase
    try:
        manager.state.phase = ChartPhase(session.phase)
    except ValueError:
        manager.state.phase = ChartPhase.WAITING

    # Restore original request
    manager.state.original_request = session.original_request


def _save_chart_manager_state(manager: ChartConversationManager, session: ConversationSession):
    """Save chart manager state to database session."""
    session.messages = [
        {"role": m.role, "content": m.content} for m in manager.state.messages
    ]
    session.phase = manager.state.phase.value
    session.original_request = manager.state.original_request


def _generate_chart_title(user_message: str, provider_name: str | None = None) -> str:
    """Generate a short title for the chart conversation."""
    try:
        from engine.llm.claude import get_provider
        from engine.llm.base import Message

        llm = get_provider(provider_name)

        prompt = f"""Generate a very short title (3-5 words max) for a chart creation request.
Output ONLY the title, nothing else. No quotes, no punctuation at the end.

Request: {user_message[:300]}

Title:"""

        response = llm.generate(
            messages=[Message(role="user", content=prompt)],
            max_tokens=30,
            temperature=0.3,
        )

        title = response.content.strip().strip('"\'').strip()
        if len(title) > 50:
            title = title[:47] + "..."
        return title
    except Exception:
        if len(user_message) <= 40:
            return user_message
        return user_message[:37] + "..."


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
    db: DBSession = Depends(get_db),
):
    """
    Send a message in a chart conversation.

    This is the simplified chart-first flow:
    1. User describes a chart
    2. System generates it
    3. User can refine or accept
    """
    session, manager = _get_or_create_chart_session(db, current_user, request.session_id)

    # Track if this is the first user message (for title generation)
    is_first_message = len([m for m in (session.messages or []) if m.get("role") == "user"]) == 0

    try:
        result = manager.process_message(request.message)

        # Save updated state to database
        _save_chart_manager_state(manager, session)

        # Update chart_id if a chart was created
        if result.chart_id:
            session.chart_id = result.chart_id

        # Generate title after first user message (skip action messages)
        if is_first_message and not request.message.startswith("__action:") and not session.title:
            session.title = _generate_chart_title(request.message, current_user.preferred_provider)

        db.commit()

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
            session_id=session.id,
            title=session.title,
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
            session_id=session.id,
            title=session.title,
            error=str(e),
        )


@router.post("/conversation/new", response_model=ChartMessageResponse)
async def new_chart_conversation(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Start a new chart conversation."""
    # Import cleanup function from conversation router
    from .conversation import cleanup_old_conversations

    # Cleanup old temporary conversations
    cleanup_old_conversations(db, current_user.id)

    # Create new session in database
    session = ConversationSession(
        user_id=current_user.id,
        messages=[],
        phase="waiting",
        conversation_type="chart",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Create manager for this session
    manager = ChartConversationManager(provider_name=current_user.preferred_provider)
    _chart_managers[session.id] = manager

    return ChartMessageResponse(
        response="What chart would you like to create? Describe what you want to see.",
        phase="waiting",
        session_id=session.id,
        title=None,
    )


@router.delete("/conversation/{session_id}")
async def delete_chart_conversation(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Delete a chart conversation session."""
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == session_id,
            ConversationSession.user_id == current_user.id,
            ConversationSession.conversation_type == "chart",
        )
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Remove from cache
    if session_id in _chart_managers:
        del _chart_managers[session_id]

    db.delete(session)
    db.commit()

    return {"success": True}


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
    db: DBSession = Depends(get_db),
):
    """Delete a chart from the library."""
    storage = get_chart_storage()

    if not storage.delete(chart_id):
        raise HTTPException(status_code=404, detail="Chart not found")

    # Delete any linked conversations
    db.query(ConversationSession).filter(
        ConversationSession.chart_id == chart_id
    ).delete()
    db.commit()

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

    dashboard = create_chart_dashboard(chart)

    # Return chart URL for React frontend
    chart_url = f"/chart/{chart.id}"

    return ChartCreateResponse(
        success=True,
        chart=_chart_to_schema(chart),
        chart_url=chart_url,
    )


@router.get("/by-slug/{slug}")
async def get_chart_by_slug(
    slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get a chart by its URL slug.

    This looks up the dashboard by slug and returns the chart info.
    Used for the "View Source" functionality.
    """
    dashboard_storage = get_dashboard_storage()
    dashboard = dashboard_storage.get_by_slug(slug)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Page not found")

    # Check if this is a single-chart dashboard (chart page)
    if not dashboard.chart_ids or len(dashboard.chart_ids) == 0:
        raise HTTPException(status_code=404, detail="No charts in this page")

    chart_storage = get_chart_storage()

    # For single-chart dashboards, return the chart
    if len(dashboard.chart_ids) == 1:
        chart = chart_storage.get(dashboard.chart_ids[0])
        if not chart:
            raise HTTPException(status_code=404, detail="Chart not found")

        return {
            "type": "chart",
            "chart_id": chart.id,
            "chart": _chart_to_schema(chart),
            "dashboard_slug": dashboard.slug,
        }

    # For multi-chart dashboards, return dashboard info
    charts = []
    for chart_id in dashboard.chart_ids:
        chart = chart_storage.get(chart_id)
        if chart:
            charts.append(_chart_to_schema(chart))

    return {
        "type": "dashboard",
        "dashboard_id": dashboard.id,
        "dashboard_slug": dashboard.slug,
        "dashboard_title": dashboard.title,
        "charts": charts,
    }


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

    dashboard = create_chart_dashboard(chart)

    return {
        "chart_id": chart_id,
        "url": f"/chart/{chart_id}",
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

        dashboard_url = f"/dashboard/{dashboard.slug}"

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

    return _dashboard_to_schema(dashboard)


@router.post("/dashboards/{dashboard_id}/publish")
async def publish_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
):
    """Mark a dashboard as published (no-op, dashboards are always accessible)."""
    storage = get_dashboard_storage()
    dashboard = storage.get(dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return {
        "success": True,
        "dashboard_id": dashboard_id,
        "slug": dashboard.slug,
        "url": f"/dashboard/{dashboard.slug}",
    }
