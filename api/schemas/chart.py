"""
Chart-related Pydantic schemas for the chart-first architecture.
"""

from datetime import datetime

from pydantic import BaseModel


# =============================================================================
# Chart Conversation Schemas
# =============================================================================


class ChartMessageRequest(BaseModel):
    """Schema for sending a message in chart conversation."""

    message: str
    session_id: int | None = None  # Optional: send to specific chart session


class ChartActionButton(BaseModel):
    """Schema for an action button in chart conversation."""

    id: str
    label: str
    style: str = "secondary"  # "primary" or "secondary"


class ChartMessageResponse(BaseModel):
    """Schema for chart conversation message response."""

    response: str
    phase: str  # waiting, generating, viewing, complete
    session_id: int
    title: str | None = None  # Conversation title
    chart_id: str | None = None
    chart_url: str | None = None  # URL with ?embed=true
    chart_title: str | None = None
    dashboard_slug: str | None = None  # Slug of the preview dashboard
    action_buttons: list[ChartActionButton] | None = None
    error: str | None = None


# =============================================================================
# Chart Library Schemas
# =============================================================================


class ChartConfigSchema(BaseModel):
    """Schema for chart configuration."""

    x: str | None = None
    y: str | list[str] | None = None
    value: str | None = None
    series: str | None = None
    title: str | None = None
    extra_props: dict | None = None


class ChartSchema(BaseModel):
    """Schema for a stored chart."""

    id: str
    title: str
    description: str
    query_name: str
    sql: str
    chart_type: str
    config: ChartConfigSchema
    created_at: datetime
    updated_at: datetime
    original_request: str
    is_valid: bool

    class Config:
        from_attributes = True


class ChartListResponse(BaseModel):
    """Schema for list of charts."""

    charts: list[ChartSchema]
    total: int


class ChartCreateRequest(BaseModel):
    """Schema for creating a chart via natural language."""

    request: str  # Natural language description


class ChartCreateResponse(BaseModel):
    """Schema for chart creation response."""

    success: bool
    chart: ChartSchema | None = None
    chart_url: str | None = None
    error: str | None = None


class ChartUpdateRequest(BaseModel):
    """Schema for updating a chart's metadata."""

    title: str | None = None
    description: str | None = None


class ChartUpdateResponse(BaseModel):
    """Schema for chart update response."""

    success: bool
    chart: ChartSchema | None = None
    error: str | None = None


class ChartDuplicateResponse(BaseModel):
    """Schema for chart duplication response."""

    success: bool
    chart: ChartSchema | None = None
    chart_url: str | None = None
    error: str | None = None


# =============================================================================
# Dashboard Composition Schemas
# =============================================================================


class DashboardLayoutSection(BaseModel):
    """Schema for a dashboard section."""

    title: str | None = None
    chart_ids: list[str]


class DashboardLayoutSchema(BaseModel):
    """Schema for dashboard layout."""

    sections: list[DashboardLayoutSection]


class DashboardSchema(BaseModel):
    """Schema for a composed dashboard."""

    id: str
    slug: str
    title: str
    description: str | None = None
    chart_ids: list[str]
    layout: DashboardLayoutSchema | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DashboardListResponse(BaseModel):
    """Schema for list of dashboards."""

    dashboards: list[DashboardSchema]
    total: int


class DashboardCreateRequest(BaseModel):
    """Schema for creating a new dashboard."""

    title: str
    description: str | None = None
    chart_ids: list[str] | None = None


class DashboardCreateResponse(BaseModel):
    """Schema for dashboard creation response."""

    success: bool
    dashboard: DashboardSchema | None = None
    dashboard_url: str | None = None
    error: str | None = None


class DashboardAddChartRequest(BaseModel):
    """Schema for adding a chart to a dashboard."""

    chart_id: str
    section: str | None = None  # Optional section name


class DashboardRemoveChartRequest(BaseModel):
    """Schema for removing a chart from a dashboard."""

    chart_id: str


class DashboardReorderChartsRequest(BaseModel):
    """Schema for reordering charts in a dashboard."""

    chart_ids: list[str]  # New order
