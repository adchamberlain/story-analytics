"""
Charts v2 router: AI chart proposal, save, and retrieval.
The core product loop: upload → propose → render → save.
"""

from __future__ import annotations

import traceback
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services.duckdb_service import get_duckdb_service, q
from ..services.chart_storage import save_chart, load_chart, list_charts, delete_chart, update_chart, _validate_id

from engine.v2.schema_analyzer import DataProfile, ColumnProfile
from engine.v2.chart_proposer import propose_chart
from engine.v2.chart_editor import edit_chart


router = APIRouter(prefix="/v2/charts", tags=["charts-v2"])

SNAPSHOTS_DIR = Path(__file__).parent.parent.parent / "data" / "snapshots"

# Map Settings UI provider names → engine provider names
_SETTINGS_TO_ENGINE_PROVIDER = {
    "anthropic": "claude",
    "openai": "openai",
    "google": "gemini",
}


def _get_engine_provider() -> str | None:
    """Read the user's selected AI provider from settings and map to engine name."""
    from ..services.settings_storage import load_settings

    settings = load_settings()
    provider = settings.ai_provider

    # Auto-detect from first available key if not explicitly set
    if not provider:
        if settings.anthropic_api_key:
            provider = "anthropic"
        elif settings.openai_api_key:
            provider = "openai"
        elif settings.google_api_key:
            provider = "google"

    return _SETTINGS_TO_ENGINE_PROVIDER.get(provider)


@router.get("/ai-status")
async def ai_status():
    """Check if AI features are available and which provider is configured."""
    from ..services.settings_storage import load_settings

    settings = load_settings()
    provider = settings.ai_provider

    # If no explicit provider set, auto-detect from keys
    if not provider:
        if settings.anthropic_api_key:
            provider = "anthropic"
        elif settings.openai_api_key:
            provider = "openai"
        elif settings.google_api_key:
            provider = "google"

    # Build list of all providers with a configured API key
    available_providers = []
    if settings.anthropic_api_key:
        available_providers.append("anthropic")
    if settings.openai_api_key:
        available_providers.append("openai")
    if settings.google_api_key:
        available_providers.append("google")

    if not provider:
        raise HTTPException(
            status_code=503,
            detail="No AI API key configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY in Settings.",
        )
    return {"available": True, "provider": provider, "available_providers": available_providers}


# ── Request / Response Schemas ───────────────────────────────────────────────

class ProposeRequest(BaseModel):
    source_id: str
    user_hint: str | None = None


class ChartConfigResponse(BaseModel):
    chart_type: str
    title: str | None = None
    subtitle: str | None = None
    source: str | None = None
    x: str | None = None
    y: str | None = None
    series: str | None = None
    horizontal: bool = False
    sort: bool = True


class ProposeResponse(BaseModel):
    success: bool
    config: ChartConfigResponse | None = None
    reasoning: str | None = None
    sql: str | None = None
    data: list[dict] | None = None
    columns: list[str] = []
    error: str | None = None


class SaveRequest(BaseModel):
    source_id: str
    chart_type: str
    title: str
    sql: str
    x: str | None = None
    y: str | list[str] | None = None
    series: str | None = None
    horizontal: bool = False
    sort: bool = True
    subtitle: str | None = None
    source: str | None = None
    reasoning: str | None = None
    config: dict | None = None
    connection_id: str | None = None
    source_table: str | None = None


class SavedChartResponse(BaseModel):
    id: str
    source_id: str
    chart_type: str
    title: str
    subtitle: str | None = None
    source: str | None = None
    sql: str
    x: str | None = None
    y: str | list[str] | None = None
    series: str | None = None
    horizontal: bool = False
    sort: bool = True
    created_at: str
    updated_at: str
    config: dict | None = None
    connection_id: str | None = None
    source_table: str | None = None
    status: str = "draft"
    folder_id: str | None = None


class ChartDataResponse(BaseModel):
    chart: SavedChartResponse
    data: list[dict]
    columns: list[str]


class UpdateChartRequest(BaseModel):
    chart_type: str | None = None
    title: str | None = None
    subtitle: str | None = None
    source: str | None = None
    x: str | None = None
    y: str | list[str] | None = None
    series: str | None = None
    horizontal: bool | None = None
    sort: bool | None = None
    config: dict | None = None
    folder_id: str | None = None


class BuildQueryRequest(BaseModel):
    source_id: str
    x: str
    y: str | list[str] | None = None
    series: str | None = None
    aggregation: str = "none"  # "none", "sum", "avg", "count", "min", "max"
    time_grain: str = "none"  # "none", "day", "week", "month", "quarter", "year"


class BuildQueryResponse(BaseModel):
    success: bool
    sql: str | None = None
    data: list[dict] = []
    columns: list[str] = []
    error: str | None = None


class EditRequest(BaseModel):
    chart_id: str
    message: str
    current_config: dict
    columns: list[str]
    data_summary: dict | None = None


class EditResponse(BaseModel):
    config: dict
    explanation: str


def _chart_to_response(chart) -> SavedChartResponse:
    """Convert a SavedChart to a SavedChartResponse."""
    return SavedChartResponse(
        id=chart.id,
        source_id=chart.source_id,
        chart_type=chart.chart_type,
        title=chart.title,
        subtitle=chart.subtitle,
        source=chart.source,
        sql=chart.sql,
        x=chart.x,
        y=chart.y,
        series=chart.series,
        horizontal=chart.horizontal,
        sort=chart.sort,
        created_at=chart.created_at,
        updated_at=chart.updated_at,
        config=chart.config,
        connection_id=chart.connection_id,
        source_table=chart.source_table,
        status=chart.status,
        folder_id=chart.folder_id,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

VALID_AGGREGATIONS = {"none", "sum", "avg", "median", "count", "min", "max"}


def _format_sql(sql: str) -> str:
    """Add line breaks before major SQL keywords for readability."""
    import re
    for kw in ["FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"]:
        sql = re.sub(rf"\s+({kw}\b)", f"\n{kw}", sql, flags=re.IGNORECASE)
    return sql.strip()
VALID_TIME_GRAINS = {"none", "day", "week", "month", "quarter", "year"}


@router.post("/build-query", response_model=BuildQueryResponse)
async def build_query(request: BuildQueryRequest):
    """
    Deterministic SQL builder: user picks columns, we generate and execute SQL.
    No LLM involved.
    """
    if request.aggregation not in VALID_AGGREGATIONS:
        return BuildQueryResponse(
            success=False,
            error=f"Invalid aggregation: {request.aggregation}. Must be one of {VALID_AGGREGATIONS}",
        )
    if request.time_grain not in VALID_TIME_GRAINS:
        return BuildQueryResponse(
            success=False,
            error=f"Invalid time grain: {request.time_grain}. Must be one of {VALID_TIME_GRAINS}",
        )

    db = get_duckdb_service()

    # Validate source exists and columns are valid
    try:
        schema = db.get_schema(request.source_id)
    except Exception as e:
        return BuildQueryResponse(success=False, error=f"Source not found: {e}")

    valid_cols = {c.name for c in schema.columns}

    # Normalize y: single-element list → scalar string
    y = request.y
    if isinstance(y, list):
        if len(y) == 1:
            y = y[0]
        elif len(y) == 0:
            y = None

    # Validate columns
    for col_name, col_label in [(request.x, "x"), (request.series, "series")]:
        if col_name and col_name not in valid_cols:
            return BuildQueryResponse(
                success=False,
                error=f"Column {q(col_name)} not found in source. Available: {sorted(valid_cols)}",
            )

    # Validate y column(s)
    if isinstance(y, list):
        for yc in y:
            if yc not in valid_cols:
                return BuildQueryResponse(
                    success=False,
                    error=f"Column {q(yc)} not found in source. Available: {sorted(valid_cols)}",
                )
    elif y and y not in valid_cols:
        return BuildQueryResponse(
            success=False,
            error=f"Column {q(y)} not found in source. Available: {sorted(valid_cols)}",
        )

    table_name = f"src_{request.source_id}"

    # ── Multi-Y UNPIVOT branch ──────────────────────────────────────────────
    if isinstance(y, list) and len(y) > 1:
        y_cols_quoted = ", ".join(q(c) for c in y)
        # Include series column in subquery so it survives UNPIVOT
        series_col = q(request.series) if request.series else None
        sub_cols = [q(request.x)]
        if series_col:
            sub_cols.append(series_col)
        sub_cols.append(y_cols_quoted)
        subquery = f"SELECT {', '.join(sub_cols)} FROM {table_name}"
        unpivot = (
            f"({subquery})"
            f' UNPIVOT (metric_value FOR metric_name IN ({y_cols_quoted}))'
        )

        use_grain = request.time_grain != "none" and request.aggregation != "none"
        if use_grain:
            x_expr = f"DATE_TRUNC('{request.time_grain}', {q(request.x)})"
            x_alias = q(request.x)
        else:
            x_expr = q(request.x)
            x_alias = None

        # Build SELECT / GROUP BY with optional series column
        series_sel = f", {series_col}" if series_col else ""
        series_group = f", {series_col}" if series_col else ""

        if request.aggregation == "none":
            x_sel = f"{x_expr} AS {x_alias}" if x_alias else x_expr
            sql = (
                f"SELECT {x_sel}{series_sel}, metric_name, metric_value"
                f"\nFROM {unpivot}"
                f"\nORDER BY {x_expr} LIMIT 5000"
            )
        else:
            agg = request.aggregation.upper()
            x_sel = f"{x_expr} AS {x_alias}" if x_alias else x_expr
            sql = (
                f"SELECT {x_sel}{series_sel}, metric_name, {agg}(metric_value) AS metric_value"
                f"\nFROM {unpivot}"
                f"\nGROUP BY {x_expr}{series_group}, metric_name"
                f"\nORDER BY {x_expr} LIMIT 10000"
            )
    else:
        # ── Single-Y branch (existing logic) ────────────────────────────────
        # X column expression — apply DATE_TRUNC when a time grain is set
        use_grain = request.time_grain != "none" and request.aggregation != "none"
        if use_grain:
            x_expr = f"DATE_TRUNC('{request.time_grain}', {q(request.x)})"
            x_select = f"{x_expr} AS {q(request.x)}"
        else:
            x_expr = q(request.x)
            x_select = q(request.x)

        # Build SQL
        if request.aggregation == "none":
            # Raw select
            select_cols = [x_select]
            if y:
                select_cols.append(q(y))
            if request.series:
                select_cols.append(q(request.series))
            sql = f"SELECT {', '.join(select_cols)} FROM {table_name} ORDER BY {x_expr} LIMIT 5000"
        elif request.aggregation == "count" and not y:
            # COUNT(*) with no y column
            select_cols = [x_select, 'COUNT(*) AS "count"']
            group_cols = [x_expr]
            if request.series:
                select_cols.append(q(request.series))
                group_cols.append(q(request.series))
            sql = (
                f"SELECT {', '.join(select_cols)} FROM {table_name} "
                f"GROUP BY {', '.join(group_cols)} ORDER BY {x_expr} LIMIT 10000"
            )
        elif not y:
            # Non-count aggregation requires a y column (SUM(*), AVG(*) etc. are invalid SQL)
            return BuildQueryResponse(
                success=False,
                error=f"{request.aggregation.upper()}() requires a Y column. Select a numeric column or use COUNT.",
            )
        else:
            # Aggregated query
            agg = request.aggregation.upper()
            y_col = y
            y_quoted = q(y_col)
            y_alias = y
            select_cols = [x_select, f'{agg}({y_quoted}) AS {q(y_alias)}']
            group_cols = [x_expr]
            if request.series:
                select_cols.append(q(request.series))
                group_cols.append(q(request.series))
            sql = (
                f"SELECT {', '.join(select_cols)} FROM {table_name} "
                f"GROUP BY {', '.join(group_cols)} ORDER BY {x_expr} LIMIT 10000"
            )

    # Execute
    try:
        result = db.execute_query(sql, request.source_id)
        return BuildQueryResponse(
            success=True,
            sql=_format_sql(sql),
            data=result.rows,
            columns=result.columns,
        )
    except Exception as e:
        traceback.print_exc()
        return BuildQueryResponse(success=False, sql=_format_sql(sql), error=f"SQL execution failed: {e}")


@router.post("/propose", response_model=ProposeResponse)
async def propose(request: ProposeRequest):
    """
    AI proposes the best chart for an uploaded dataset.

    1. Gets schema from DuckDB service
    2. Sends schema to LLM → gets chart type, SQL, title
    3. Executes SQL → returns chart config + data
    """
    db = get_duckdb_service()

    # Get schema profile
    try:
        schema = db.get_schema(request.source_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Source not found: {e}")

    # Build data profile for the proposer
    profile = DataProfile(
        filename=schema.filename,
        row_count=schema.row_count,
        columns=[
            ColumnProfile(
                name=c.name,
                type=c.type,
                sample_values=c.sample_values,
                distinct_count=c.distinct_count,
                null_count=c.null_count,
                min_value=c.min_value,
                max_value=c.max_value,
            )
            for c in schema.columns
        ],
    )

    # Stage 1: AI proposes chart
    table_name = f"src_{request.source_id}"
    proposal = propose_chart(
        profile=profile,
        table_name=table_name,
        user_hint=request.user_hint,
        provider_name=_get_engine_provider(),
    )

    if not proposal.success:
        return ProposeResponse(success=False, error=proposal.error)

    # Stage 2: Execute the proposed SQL (validate it's read-only first)
    data = []
    columns = []
    if proposal.sql:
        import re as _re
        # Strip leading SQL comments before checking the first keyword
        sql_stripped = _re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', proposal.sql, flags=_re.DOTALL)
        first_kw = _re.match(r'\s*(\w+)', sql_stripped)
        if not first_kw or first_kw.group(1).upper() not in ("SELECT", "WITH"):
            return ProposeResponse(success=False, error="AI generated non-SELECT SQL")
        try:
            result = db.execute_query(proposal.sql, request.source_id)
            data = result.rows
            columns = result.columns
        except Exception as e:
            traceback.print_exc()
            return ProposeResponse(
                success=False,
                error=f"SQL execution failed: {e}\nSQL: {proposal.sql}",
                sql=proposal.sql,
                config=ChartConfigResponse(
                    chart_type=proposal.chart_type or "BarChart",
                    title=proposal.title,
                    subtitle=proposal.subtitle,
                    source=proposal.source,
                    x=proposal.x,
                    y=proposal.y,
                    series=proposal.series,
                    horizontal=proposal.horizontal,
                    sort=proposal.sort,
                ),
                reasoning=proposal.reasoning,
            )

    return ProposeResponse(
        success=True,
        config=ChartConfigResponse(
            chart_type=proposal.chart_type or "BarChart",
            title=proposal.title,
            subtitle=proposal.subtitle,
            source=proposal.source,
            x=proposal.x,
            y=proposal.y,
            series=proposal.series,
            horizontal=proposal.horizontal,
            sort=proposal.sort,
        ),
        reasoning=proposal.reasoning,
        sql=proposal.sql,
        data=data,
        columns=columns,
    )


def _validate_readonly_sql(sql: str) -> str | None:
    """Return an error message if SQL is not a read-only SELECT/WITH statement."""
    import re
    # Strip leading SQL comments (block and line) before checking the first keyword
    stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=re.DOTALL)
    first_kw = re.match(r'\s*(\w+)', stripped)
    if not first_kw or first_kw.group(1).upper() not in ("SELECT", "WITH"):
        return "Only SELECT queries can be saved"
    return None


@router.post("/save", response_model=SavedChartResponse)
async def save(request: SaveRequest):
    """Save a chart configuration."""
    if request.sql:
        err = _validate_readonly_sql(request.sql)
        if err:
            raise HTTPException(status_code=400, detail=err)
    chart = save_chart(
        source_id=request.source_id,
        chart_type=request.chart_type,
        title=request.title,
        sql=request.sql,
        x=request.x,
        y=request.y,
        series=request.series,
        horizontal=request.horizontal,
        sort=request.sort,
        subtitle=request.subtitle,
        source=request.source,
        reasoning=request.reasoning,
        config=request.config,
        connection_id=request.connection_id,
        source_table=request.source_table,
    )

    return _chart_to_response(chart)


@router.get("/", response_model=list[SavedChartResponse])
async def list_all():
    """List all saved charts."""
    charts = list_charts()
    return [_chart_to_response(c) for c in charts]


@router.get("/{chart_id}", response_model=ChartDataResponse)
async def get_chart(chart_id: str):
    """Get a saved chart with its data (re-executes SQL)."""
    chart = load_chart(chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    db = get_duckdb_service()

    data = []
    columns = []
    if chart.sql:
        try:
            result = db.execute_query(chart.sql, chart.source_id)
            data = result.rows
            columns = result.columns
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to execute chart SQL: {e}")

    return ChartDataResponse(
        chart=_chart_to_response(chart),
        data=data,
        columns=columns,
    )


@router.put("/{chart_id}", response_model=SavedChartResponse)
async def update(chart_id: str, request: UpdateChartRequest):
    """Update a saved chart's configuration."""
    fields = request.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    chart = update_chart(chart_id, **fields)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    return _chart_to_response(chart)


@router.post("/edit", response_model=EditResponse)
async def edit(request: EditRequest):
    """AI edits a chart config based on a user message."""
    try:
        result = edit_chart(
            current_config=request.current_config,
            user_message=request.message,
            columns=request.columns,
            provider_name=_get_engine_provider(),
            data_summary=request.data_summary,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Edit failed: {e}")

    if not result.success:
        raise HTTPException(status_code=422, detail=result.error or "Edit failed")

    return EditResponse(
        config=result.config,
        explanation=result.explanation or "Done.",
    )


@router.delete("/{chart_id}")
async def remove_chart(chart_id: str):
    """Delete a saved chart."""
    if not delete_chart(chart_id):
        raise HTTPException(status_code=404, detail="Chart not found")
    return {"deleted": True}


# ── Publish / Unpublish ──────────────────────────────────────────────────────

@router.put("/{chart_id}/publish", response_model=SavedChartResponse)
async def publish_chart(chart_id: str):
    """Publish a chart, making it accessible via the public endpoint."""
    chart = update_chart(chart_id, status="published")
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return _chart_to_response(chart)


@router.put("/{chart_id}/unpublish", response_model=SavedChartResponse)
async def unpublish_chart(chart_id: str):
    """Unpublish a chart, reverting it to draft status."""
    chart = update_chart(chart_id, status="draft")
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return _chart_to_response(chart)


@router.get("/{chart_id}/public", response_model=SavedChartResponse)
async def get_public_chart(chart_id: str):
    """Get a published chart (no auth required). Returns 403 for drafts."""
    chart = load_chart(chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    if chart.status != "published":
        raise HTTPException(status_code=403, detail="Chart is not published")
    return _chart_to_response(chart)


# ── Snapshot (static PNG fallback) ────────────────────────────────────────

@router.post("/{chart_id}/snapshot")
async def upload_snapshot(chart_id: str, request: Request):
    """Upload a PNG snapshot for a chart (used as noscript fallback and OG image)."""
    chart = load_chart(chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")
    path = SNAPSHOTS_DIR / f"{chart_id}.png"
    path.write_bytes(body)
    return {"success": True, "url": f"/api/v2/charts/{chart_id}/snapshot.png"}


@router.get("/{chart_id}/snapshot.png")
async def get_snapshot(chart_id: str):
    """Serve the stored PNG snapshot for a chart."""
    if not _validate_id(chart_id):
        raise HTTPException(status_code=400, detail="Invalid chart ID")
    path = SNAPSHOTS_DIR / f"{chart_id}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(path, media_type="image/png")


# ── Duplicate & Template ──────────────────────────────────────────────────


@router.post("/{chart_id}/duplicate", response_model=SavedChartResponse)
async def duplicate_chart(chart_id: str):
    """Duplicate a chart with a new ID. Preserves config and SQL, resets status to draft."""
    original = load_chart(chart_id)
    if not original:
        raise HTTPException(status_code=404, detail="Chart not found")

    new_chart = save_chart(
        source_id=original.source_id,
        chart_type=original.chart_type,
        title=f"{original.title} (Copy)",
        sql=original.sql,
        x=original.x,
        y=original.y,
        series=original.series,
        horizontal=original.horizontal,
        sort=original.sort,
        subtitle=original.subtitle,
        source=original.source,
        reasoning=original.reasoning,
        config=original.config,
        connection_id=original.connection_id,
        source_table=original.source_table,
    )
    return _chart_to_response(new_chart)


class SaveAsTemplateRequest(BaseModel):
    name: str
    description: str


@router.post("/{chart_id}/save-as-template")
async def save_chart_as_template(chart_id: str, request: SaveAsTemplateRequest):
    """Save a chart's config as a reusable template."""
    from ..services.template_storage import save_template

    chart = load_chart(chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    template = save_template(
        name=request.name,
        description=request.description,
        chart_type=chart.chart_type,
        config=chart.config or {},
    )

    from .templates import _to_response
    return _to_response(template)
