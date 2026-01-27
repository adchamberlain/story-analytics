"""
Chart API router - endpoints for chart-first architecture.

Provides:
- Chart conversation endpoints (simplified flow)
- Chart library endpoints (CRUD)
- Dashboard composition endpoints
"""

import asyncio
import json
from datetime import datetime
from queue import Queue, Empty
from threading import Thread

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
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
    ChartUpdateRequest,
    ChartUpdateResponse,
    ChartDuplicateResponse,
    ChartConfigUpdateRequest,
    ChartConfigUpdateResponse,
    AIConfigSuggestionRequest,
    AIConfigSuggestionResponse,
    DashboardSchema,
    DashboardLayoutSchema,
    DashboardLayoutSection,
    DashboardListResponse,
    DashboardCreateRequest,
    DashboardCreateResponse,
    DashboardAddChartRequest,
    DashboardRemoveChartRequest,
    DashboardReorderChartsRequest,
    DashboardGenerateContextRequest,
    DashboardGenerateContextResponse,
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
        print(f"  session found: {session is not None}", file=sys.stderr)
        if session:
            print(f"  session.chart_id: {session.chart_id}", file=sys.stderr)
            # Get or create manager for this session
            if session_id in _chart_managers:
                print(f"  Manager found in cache", file=sys.stderr)
                manager = _chart_managers[session_id]
                # Always restore state if session has a chart - ensures correct phase for editing
                if session.chart_id:
                    print(f"  Calling _restore_chart_manager_state", file=sys.stderr)
                    _restore_chart_manager_state(manager, session)
            else:
                print(f"  Creating new manager", file=sys.stderr)
                manager = ChartConversationManager(provider_name=user.preferred_provider)
                _restore_chart_manager_state(manager, session)
                _chart_managers[session_id] = manager
            print(f"{'='*60}\n", file=sys.stderr)
            return session, manager

    # Create new session
    print(f"  Creating new session", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)
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
    from engine.models import get_chart_storage
    from dataclasses import dataclass
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

    # Restore chart data if chart_id exists
    if session.chart_id:
        print(f"  Restoring chart data for chart_id: {session.chart_id}", file=sys.stderr)

        # Force phase to VIEWING if we have a chart - this enables refinement
        manager.state.phase = ChartPhase.VIEWING
        print(f"  Forced phase to VIEWING", file=sys.stderr)
        manager.state.current_chart_id = session.chart_id

        # Load the chart from storage
        storage = get_chart_storage()
        stored_chart = storage.get(session.chart_id)
        print(f"  Loaded chart from storage: {stored_chart is not None}", file=sys.stderr)

        if stored_chart:
            # Get chart_type as string value (it's an enum)
            chart_type_value = stored_chart.chart_type.value if hasattr(stored_chart.chart_type, 'value') else str(stored_chart.chart_type)
            print(f"  Chart type: {chart_type_value}, title: {stored_chart.title}", file=sys.stderr)

            # Create a minimal object that has the properties the manager needs
            # (.sql and .spec.chart_type)
            @dataclass
            class MinimalSpec:
                chart_type: str
                title: str
                description: str

            @dataclass
            class MinimalChart:
                sql: str
                spec: MinimalSpec

            manager.state.current_chart = MinimalChart(
                sql=stored_chart.sql,
                spec=MinimalSpec(
                    chart_type=chart_type_value,
                    title=stored_chart.title,
                    description=stored_chart.description or "",
                ),
            )

            # Set dashboard slug (chart ID is used as slug for single-chart dashboards)
            manager.state.dashboard_slug = session.chart_id
            print(f"  State restored: current_chart set, dashboard_slug={manager.state.dashboard_slug}", file=sys.stderr)
        else:
            print(f"  WARNING: Chart {session.chart_id} not found in storage!", file=sys.stderr)
    else:
        print(f"  No chart_id in session", file=sys.stderr)

    print(f"{'='*60}\n", file=sys.stderr)


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
            dashboard_slug=result.dashboard_slug,
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


@router.post("/conversation/message/stream")
async def send_chart_message_stream(
    request: ChartMessageRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Send a message in a chart conversation with streaming progress updates.

    Uses Server-Sent Events to stream progress during chart generation.

    Event types:
    - progress: Progress updates during generation
    - complete: Final response with full message data
    - error: Error occurred during processing
    """
    import sys
    # Print to both stdout and stderr to ensure visibility
    trace_msg = f"""
{'#'*60}
### STREAMING MESSAGE ENDPOINT CALLED ###
  request.session_id: {request.session_id}
  request.message: {request.message[:50]}...
{'#'*60}
"""
    print(trace_msg)  # stdout
    print(trace_msg, file=sys.stderr)  # stderr

    session, manager = _get_or_create_chart_session(db, current_user, request.session_id)

    # Track if this is the first user message (for title generation)
    is_first_message = len([m for m in (session.messages or []) if m.get("role") == "user"]) == 0

    # Queue to collect progress events from the background thread
    progress_queue: Queue = Queue()
    result_holder = {"result": None, "error": None}

    def process_message_with_progress():
        """Process message in a background thread, emitting progress to queue."""
        try:
            from engine.progress import ProgressEmitter

            # Create progress emitter that pushes to queue
            emitter = ProgressEmitter()
            emitter.add_callback(lambda event: progress_queue.put(("progress", event)))

            # Set emitter on manager
            manager.progress_emitter = emitter

            # Process the message
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
                    {"id": btn.id, "label": btn.label, "style": btn.style}
                    for btn in result.action_buttons
                ]

            # Build response data
            response_data = {
                "response": result.response,
                "phase": manager.state.phase.value,
                "session_id": session.id,
                "title": session.title,
                "chart_id": result.chart_id,
                "chart_url": result.chart_url,
                "chart_title": manager.state.current_chart.spec.title
                if manager.state.current_chart
                else None,
                "dashboard_slug": result.dashboard_slug,
                "action_buttons": action_buttons,
                "error": result.error,
            }

            result_holder["result"] = response_data

        except Exception as e:
            result_holder["error"] = str(e)

        # Signal completion
        progress_queue.put(("done", None))

    async def event_generator():
        """Generate SSE events from the progress queue."""
        # Start processing in background thread
        thread = Thread(target=process_message_with_progress)
        thread.start()

        try:
            while True:
                # Check queue with timeout
                try:
                    event_type, event_data = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: progress_queue.get(timeout=0.1)
                    )
                except Empty:
                    continue

                if event_type == "done":
                    # Send final result or error
                    if result_holder["error"]:
                        yield f"event: error\ndata: {json.dumps({'error': result_holder['error']})}\n\n"
                    else:
                        yield f"event: complete\ndata: {json.dumps(result_holder['result'])}\n\n"
                    break
                elif event_type == "progress":
                    yield f"event: progress\ndata: {json.dumps(event_data.to_dict())}\n\n"

        finally:
            thread.join(timeout=1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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


@router.patch("/library/{chart_id}", response_model=ChartUpdateResponse)
async def update_chart(
    chart_id: str,
    request: ChartUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """Update a chart's title, description, and/or SQL."""
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    # Update fields if provided
    if request.title is not None:
        chart.title = request.title
    if request.description is not None:
        chart.description = request.description

    # Handle SQL update with validation
    if request.sql is not None:
        # Validate the SQL by attempting to execute it
        from engine.sql_validator import SQLValidator
        validator = SQLValidator()

        try:
            # Test execute the query
            conn = validator._get_connection()
            conn.execute(request.sql).fetchdf()
            # SQL is valid, update it
            chart.sql = request.sql
            chart.is_valid = True
            chart.last_error = None
        except Exception as e:
            # SQL is invalid
            return ChartUpdateResponse(
                success=False,
                error=f"SQL validation failed: {str(e)}",
            )

    # Update timestamp
    chart.updated_at = datetime.utcnow()

    # Save changes
    storage.save(chart)

    return ChartUpdateResponse(
        success=True,
        chart=_chart_to_schema(chart),
    )


@router.post("/library/{chart_id}/duplicate", response_model=ChartDuplicateResponse)
async def duplicate_chart(
    chart_id: str,
    current_user: User = Depends(get_current_user),
):
    """Create a duplicate of an existing chart."""
    storage = get_chart_storage()
    original = storage.get(chart_id)

    if not original:
        raise HTTPException(status_code=404, detail="Chart not found")

    # Create a new chart with copied data
    import uuid

    new_chart = Chart(
        id=str(uuid.uuid4()),
        title=f"{original.title} (Copy)",
        description=original.description,
        query_name=f"{original.query_name}_copy",
        sql=original.sql,
        chart_type=original.chart_type,
        config=original.config,
        original_request=original.original_request,
        is_valid=original.is_valid,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Save the duplicate
    storage.save(new_chart)

    # Create preview dashboard for the new chart
    from engine.dashboard_composer import create_chart_dashboard

    create_chart_dashboard(new_chart)

    return ChartDuplicateResponse(
        success=True,
        chart=_chart_to_schema(new_chart),
        chart_url=f"/chart/{new_chart.id}",
    )


@router.patch("/library/{chart_id}/config", response_model=ChartConfigUpdateResponse)
async def update_chart_config(
    chart_id: str,
    request: ChartConfigUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Update a chart's visual configuration.

    This updates only the config properties (colors, titles, orientation, etc.)
    without modifying the SQL or data.
    """
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    # Validate config fields based on chart type
    chart_type = chart.chart_type.value
    allowed_fields = _get_allowed_config_fields(chart_type)

    # Filter to only allowed fields
    filtered_config = {}
    for key, value in request.config.items():
        if key in allowed_fields:
            filtered_config[key] = value

    # Update the config - merge with existing
    # Map from camelCase (frontend) to snake_case (backend model)
    field_mapping = {
        # Core data binding
        "x": "x",
        "y": "y",
        "value": "value",
        "series": "series",
        # Formatting
        "xFmt": "x_fmt",
        "yFmt": "y_fmt",
        "valueFmt": "value_fmt",
        # Labels and titles
        "title": "title",
        "xAxisTitle": "x_axis_title",
        "yAxisTitle": "y_axis_title",
        # Styling
        "color": "color",
        "fillColor": "fill_color",
        "backgroundColor": "background_color",
        "gridColor": "grid_color",
        # Typography
        "titleFontSize": "title_font_size",
        "legendFontSize": "legend_font_size",
        "axisFontSize": "axis_font_size",
        # Display options
        "showLegend": "show_legend",
        "showGrid": "show_grid",
        "showValues": "show_values",
        # Line/scatter options
        "lineWidth": "line_width",
        "markerSize": "marker_size",
        # Bar chart options
        "barGap": "bar_gap",
        "barGroupGap": "bar_group_gap",
        # Axis options
        "tickAngle": "tick_angle",
        "yAxisMin": "y_axis_min",
        "yAxisMax": "y_axis_max",
        # Chart-specific options
        "horizontal": "horizontal",
        "stacked": "stacked",
        "sort": "sort",
        # Legend
        "legendLabel": "legend_label",
    }

    if chart.config:
        # Apply updates directly to config object
        for key, value in filtered_config.items():
            if key in field_mapping:
                setattr(chart.config, field_mapping[key], value)
            else:
                # Store unknown fields in extra_props
                if not chart.config.extra_props:
                    chart.config.extra_props = {}
                chart.config.extra_props[key] = value
    else:
        # Create new config - convert camelCase to snake_case
        from engine.models.chart import ChartConfig
        converted = {}
        for key, value in filtered_config.items():
            if key in field_mapping:
                converted[field_mapping[key]] = value
        chart.config = ChartConfig(**converted)

    # Update timestamp
    chart.updated_at = datetime.utcnow()

    # Save changes
    storage.save(chart)

    return ChartConfigUpdateResponse(
        success=True,
        chart=_chart_to_schema(chart),
    )


@router.post("/library/{chart_id}/suggest-config", response_model=AIConfigSuggestionResponse)
async def suggest_chart_config(
    chart_id: str,
    request: AIConfigSuggestionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Get an AI-powered suggestion for config changes.

    Takes the current config and a natural language request,
    returns suggested config changes with an explanation.
    """
    storage = get_chart_storage()
    chart = storage.get(chart_id)

    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    from engine.llm.claude import get_provider
    from engine.llm.base import Message
    from engine.config_loader import get_config_loader

    llm = get_provider(current_user.preferred_provider)
    loader = get_config_loader()

    # Load the config edit prompt
    try:
        prompt_config = loader.get_prompt("config_edit")
        system_prompt = prompt_config.get("system", "")
    except Exception:
        # Fallback system prompt
        system_prompt = """You are a chart configuration assistant. Given a chart's current configuration and a user request,
suggest specific config changes to achieve the desired result.

Output ONLY a raw JSON object with exactly two fields:
{"suggested_config": {...}, "explanation": "..."}

Available config fields by chart type:
- All charts: title, xAxisTitle, yAxisTitle, color (hex color)
- BarChart: horizontal (boolean), stacked (boolean)
- LineChart/AreaChart: stacked (boolean)
- BigValue: valueFormat (currency|percent|number), positiveIsGood (boolean), showTrend (boolean), sparklineType (line|bar)

Color mappings: blue=#3b82f6, red=#ef4444, green=#22c55e, yellow=#eab308, purple=#a855f7, orange=#f97316, gray=#6b7280

IMPORTANT: Output raw JSON only. No markdown code blocks, no extra text before or after."""

    # Build the user message
    user_message = f"""Chart Type: {request.chart_type}

Current Config:
{json.dumps(request.current_config, indent=2)}

User Request: {request.user_request}

Suggest the config changes needed."""

    try:
        response = llm.generate(
            messages=[Message(role="user", content=user_message)],
            system_prompt=system_prompt,
            max_tokens=500,
            temperature=0.3,
        )

        # Parse the response
        content = response.content.strip()

        # Try to extract JSON from the response
        import re

        # First, try to find JSON in a code block
        code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', content)
        if code_block_match:
            json_str = code_block_match.group(1)
        else:
            # Find the first complete JSON object by matching braces
            json_str = _extract_json_object(content)

        if json_str:
            result = json.loads(json_str)
            return AIConfigSuggestionResponse(
                suggested_config=result.get("suggested_config", {}),
                explanation=result.get("explanation", "Changes suggested based on your request."),
            )
        else:
            # Try a more lenient approach - maybe the LLM just returned the config directly
            if content.startswith('{'):
                try:
                    result = json.loads(content)
                    # Check if it looks like a direct config response
                    if "suggested_config" in result:
                        return AIConfigSuggestionResponse(
                            suggested_config=result.get("suggested_config", {}),
                            explanation=result.get("explanation", "Changes suggested."),
                        )
                    else:
                        # Assume the whole thing is the suggested config
                        return AIConfigSuggestionResponse(
                            suggested_config=result,
                            explanation="Config changes suggested based on your request.",
                        )
                except json.JSONDecodeError:
                    pass
            raise ValueError("No JSON found in response")

    except json.JSONDecodeError as e:
        # Return a helpful error response for JSON parsing issues
        return AIConfigSuggestionResponse(
            suggested_config={},
            explanation=f"Failed to parse AI response. Try a simpler request like 'make horizontal' or 'change color to blue'.",
        )
    except Exception as e:
        # Return a helpful error response
        return AIConfigSuggestionResponse(
            suggested_config={},
            explanation=f"Could not generate suggestion: {str(e)}",
        )


def _extract_json_object(text: str) -> str | None:
    """Extract the first complete JSON object from text by matching braces."""
    start = text.find('{')
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for i, char in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        if char == '\\' and in_string:
            escape_next = True
            continue
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return text[start:i+1]

    return None


def _get_allowed_config_fields(chart_type: str) -> set[str]:
    """Get the allowed config fields for a given chart type."""
    # Base fields for all charts - labels, colors, typography, display options
    base_fields = {
        # Core data binding
        "x", "y", "series", "value",
        # Formatting
        "xFmt", "yFmt", "valueFmt",
        # Labels and titles
        "title", "xAxisTitle", "yAxisTitle",
        # Styling
        "color", "fillColor", "backgroundColor", "gridColor",
        # Typography
        "titleFontSize", "legendFontSize", "axisFontSize",
        # Display options
        "showLegend", "showGrid", "showValues",
        # Axis options
        "tickAngle", "yAxisMin", "yAxisMax",
        # Legend
        "legendLabel",
    }

    # Chart-type-specific fields
    type_fields = {
        "BarChart": {"horizontal", "stacked", "sort", "barGap", "barGroupGap"},
        "LineChart": {"stacked", "lineWidth", "markerSize"},
        "AreaChart": {"stacked", "fillColor", "lineWidth"},
        "ScatterPlot": {"markerSize"},
        "BigValue": {"valueFormat", "positiveIsGood", "showTrend", "sparklineType", "comparisonValue", "comparisonLabel"},
        "DataTable": set(),
        "DualTrendChart": {"metricLabel"},
        "Histogram": {"barGap"},
        "FunnelChart": set(),
        "Heatmap": set(),
    }

    return base_fields | type_fields.get(chart_type, set())


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


@router.get("/library/{chart_id}/session")
async def get_chart_session(
    chart_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get the conversation session associated with a chart."""
    # Find session linked to this chart
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.chart_id == chart_id,
            ConversationSession.user_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="No session found for this chart")

    return {
        "chart_id": chart_id,
        "session_id": session.id,
        "title": session.title,
        "phase": session.phase,
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
    db: DBSession = Depends(get_db),
):
    """Create a new dashboard."""
    from ..models.dashboard import Dashboard as DBDashboard

    composer = DashboardComposer()

    try:
        # Create dashboard in file storage
        dashboard = composer.create_dashboard(
            title=request.title,
            description=request.description,
            chart_ids=request.chart_ids,
        )

        # Also create record in database so it appears in the dashboard list
        db_dashboard = DBDashboard(
            user_id=current_user.id,
            slug=dashboard.slug,
            title=dashboard.title,
            file_path=f".story-analytics/dashboards/{dashboard.id}.json",
        )
        db.add(db_dashboard)
        db.commit()

        dashboard_url = f"/dashboard/{dashboard.slug}"

        return DashboardCreateResponse(
            success=True,
            dashboard=_dashboard_to_schema(dashboard),
            dashboard_url=dashboard_url,
        )

    except Exception as e:
        db.rollback()
        return DashboardCreateResponse(
            success=False,
            error=str(e),
        )


@router.post("/dashboards/generate-context", response_model=DashboardGenerateContextResponse)
async def generate_dashboard_context(
    request: DashboardGenerateContextRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a context block for a dashboard using AI.

    Takes the dashboard title and list of charts, and generates
    a short summary paragraph to display at the top of the dashboard.
    Uses the semantic layer for business context when available.
    """
    from engine.llm.claude import get_provider
    from engine.llm.base import Message
    from engine.semantic import SemanticLayer

    llm = get_provider(current_user.preferred_provider)

    # Load semantic layer for business context
    semantic_path = Path(__file__).parent.parent.parent / "sources" / (current_user.preferred_source or "snowflake_saas") / "semantic.yaml"
    business_context = ""
    if semantic_path.exists():
        try:
            semantic_layer = SemanticLayer.load(str(semantic_path))
            bc = semantic_layer.business_context
            business_context = f"""
Business Domain: {bc.domain}
Key Metrics: {', '.join(bc.key_metrics) if bc.key_metrics else 'Not specified'}
Key Dimensions: {', '.join(bc.key_dimensions) if bc.key_dimensions else 'Not specified'}
"""
            # Add relevant glossary terms
            if bc.business_glossary:
                glossary_items = [f"{term}: {definition}" for term, definition in list(bc.business_glossary.items())[:5]]
                business_context += f"Business Glossary: {'; '.join(glossary_items)}\n"
        except Exception:
            pass  # Continue without semantic layer if loading fails

    # Build chart descriptions
    chart_list = "\n".join(
        f"- {chart.title}: {chart.description}"
        for chart in request.charts
    )

    prompt = f"""Write a brief context paragraph (2-3 sentences) for a dashboard titled "{request.title}".
{business_context}
The dashboard contains these charts:
{chart_list}

Write a helpful overview that explains what this dashboard shows and why it's useful.
Use the business domain terminology where appropriate (e.g., MRR, churn, cohort analysis).
Be concise and professional. Output ONLY the context paragraph, nothing else."""

    try:
        response = llm.generate(
            messages=[Message(role="user", content=prompt)],
            max_tokens=200,
            temperature=0.5,
        )

        context = response.content.strip()
        return DashboardGenerateContextResponse(context=context)

    except Exception as e:
        # Return a simple fallback if AI fails
        chart_names = ", ".join(c.title for c in request.charts[:3])
        if len(request.charts) > 3:
            chart_names += f", and {len(request.charts) - 3} more"
        fallback = f"This dashboard provides insights through {len(request.charts)} charts including {chart_names}."
        return DashboardGenerateContextResponse(context=fallback)


class DashboardDescriptionUpdate(BaseModel):
    """Schema for updating dashboard description."""
    description: str


@router.put("/dashboards/{dashboard_id}/description")
async def update_dashboard_description(
    dashboard_id: str,
    request: DashboardDescriptionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a dashboard's description/context block."""
    storage = get_dashboard_storage()
    dashboard = storage.get(dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Update the description
    dashboard.description = request.description
    storage.save(dashboard)

    return {"success": True}


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
