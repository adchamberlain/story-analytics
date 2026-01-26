"""
Chart and Dashboard data models for the chart-first architecture.

Key concepts:
- ChartSpec: User's intent for a single chart (input to pipeline)
- ValidatedChart: Chart with validated SQL (output from SQLAgent)
- Chart: Stored chart entity with all metadata
- Dashboard: Collection of charts with layout configuration

Note: Evidence markdown generation has been removed.
Charts are now rendered directly via the React frontend.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class FilterType(Enum):
    """Types of filter/input components."""

    DROPDOWN = "Dropdown"
    DATE_RANGE = "DateRange"
    TEXT_INPUT = "TextInput"
    BUTTON_GROUP = "ButtonGroup"
    SLIDER = "Slider"

    @classmethod
    def from_string(cls, s: str) -> "FilterType":
        """Convert string to FilterType, handling common variations."""
        normalized = s.lower().replace("_", "").replace("-", "").replace(" ", "")
        mapping = {
            "dropdown": cls.DROPDOWN,
            "select": cls.DROPDOWN,
            "daterangepicker": cls.DATE_RANGE,
            "daterange": cls.DATE_RANGE,
            "datepicker": cls.DATE_RANGE,
            "textinput": cls.TEXT_INPUT,
            "text": cls.TEXT_INPUT,
            "search": cls.TEXT_INPUT,
            "buttongroup": cls.BUTTON_GROUP,
            "buttons": cls.BUTTON_GROUP,
            "slider": cls.SLIDER,
            "range": cls.SLIDER,
        }
        return mapping.get(normalized, cls.DROPDOWN)


@dataclass
class FilterSpec:
    """
    Specification for a filter/input component.

    Filters create input variables that can be used in SQL queries
    via ${inputs.filter_name} syntax.
    """

    # Identity
    name: str  # Unique filter name, becomes ${inputs.name}
    filter_type: FilterType

    # Display
    title: str | None = None  # Label shown to user

    # For Dropdown/ButtonGroup: needs a query for options
    options_column: str | None = None  # Column to show as options
    options_table: str | None = None  # Table to get options from
    options_query: str | None = None  # Full SQL query for options (generated)
    options_query_name: str | None = None  # Query name for options

    # For DateRangePicker
    date_column: str | None = None  # Column to filter on
    default_start: str | None = None  # Default start date
    default_end: str | None = None  # Default end date

    # For Slider
    min_value: float | None = None
    max_value: float | None = None
    step: float | None = None

    # For all types
    default_value: str | None = None

    def get_sql_variable(self) -> str:
        """Get the SQL variable syntax for this filter."""
        if self.filter_type == FilterType.DATE_RANGE:
            # DateRange creates .start and .end
            return f"${{inputs.{self.name}.start}} / ${{inputs.{self.name}.end}}"
        return f"${{inputs.{self.name}}}"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "name": self.name,
            "filter_type": self.filter_type.value,
            "title": self.title,
            "options_column": self.options_column,
            "options_table": self.options_table,
            "options_query": self.options_query,
            "options_query_name": self.options_query_name,
            "date_column": self.date_column,
            "default_start": self.default_start,
            "default_end": self.default_end,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "step": self.step,
            "default_value": self.default_value,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FilterSpec":
        """Deserialize from dictionary."""
        return cls(
            name=data.get("name", "filter"),
            filter_type=FilterType.from_string(data.get("filter_type", "Dropdown")),
            title=data.get("title"),
            options_column=data.get("options_column"),
            options_table=data.get("options_table"),
            options_query=data.get("options_query"),
            options_query_name=data.get("options_query_name"),
            date_column=data.get("date_column"),
            default_start=data.get("default_start"),
            default_end=data.get("default_end"),
            min_value=data.get("min_value"),
            max_value=data.get("max_value"),
            step=data.get("step"),
            default_value=data.get("default_value"),
        )


class ChartType(Enum):
    """Types of chart visualizations."""

    LINE_CHART = "LineChart"
    BAR_CHART = "BarChart"
    AREA_CHART = "AreaChart"
    SCATTER_PLOT = "ScatterPlot"
    BUBBLE_CHART = "BubbleChart"
    HISTOGRAM = "Histogram"
    FUNNEL_CHART = "FunnelChart"
    SANKEY_DIAGRAM = "SankeyDiagram"
    HEATMAP = "Heatmap"
    DATA_TABLE = "DataTable"
    BIG_VALUE = "BigValue"
    DUAL_TREND_CHART = "DualTrendChart"

    @classmethod
    def from_string(cls, s: str) -> ChartType:
        """Convert string to ChartType, handling common variations."""
        normalized = s.lower().replace("_", "").replace("-", "").replace(" ", "")
        mapping = {
            "linechart": cls.LINE_CHART,
            "line": cls.LINE_CHART,
            "barchart": cls.BAR_CHART,
            "bar": cls.BAR_CHART,
            "areachart": cls.AREA_CHART,
            "area": cls.AREA_CHART,
            "scatterplot": cls.SCATTER_PLOT,
            "scatter": cls.SCATTER_PLOT,
            "bubblechart": cls.BUBBLE_CHART,
            "bubble": cls.BUBBLE_CHART,
            "histogram": cls.HISTOGRAM,
            "funnelchart": cls.FUNNEL_CHART,
            "funnel": cls.FUNNEL_CHART,
            "sankeydiagram": cls.SANKEY_DIAGRAM,
            "sankey": cls.SANKEY_DIAGRAM,
            "heatmap": cls.HEATMAP,
            "heat": cls.HEATMAP,
            "datatable": cls.DATA_TABLE,
            "table": cls.DATA_TABLE,
            "bigvalue": cls.BIG_VALUE,
            "kpi": cls.BIG_VALUE,
            "metric": cls.BIG_VALUE,
            "dualtrendchart": cls.DUAL_TREND_CHART,
            "dualtrend": cls.DUAL_TREND_CHART,
            "healthcheck": cls.DUAL_TREND_CHART,
            "wbr": cls.DUAL_TREND_CHART,
        }
        return mapping.get(normalized, cls.BAR_CHART)


@dataclass
class ChartConfig:
    """
    Visual configuration for a chart component.
    """

    # Core data binding
    x: str | None = None  # X-axis column
    y: str | list[str] | None = None  # Y-axis column(s)
    y2: str | list[str] | None = None  # Secondary Y-axis column(s) for dual-axis charts
    value: str | None = None  # For BigValue
    series: str | None = None  # For grouping/coloring

    # Formatting
    x_fmt: str | None = None  # X-axis format
    y_fmt: str | None = None  # Y-axis format
    value_fmt: str | None = None  # Value format for BigValue

    # Labels and titles
    title: str | None = None
    x_axis_title: str | None = None
    y_axis_title: str | None = None

    # Styling (using design system)
    color: str | None = None  # Primary color (default: indigo #6366f1)
    fill_color: str | None = None  # Fill/gradient color
    background_color: str | None = None  # Chart background color
    grid_color: str | None = None  # Grid line color

    # Typography
    title_font_size: int | None = None  # Title text size in pixels
    legend_font_size: int | None = None  # Legend text size in pixels
    axis_font_size: int | None = None  # Axis labels size in pixels

    # Display options
    show_legend: bool | None = None  # Show/hide legend
    show_grid: bool | None = None  # Show/hide grid lines
    show_values: bool | None = None  # Show data values on chart

    # Line/scatter options
    line_width: int | None = None  # Line thickness in pixels
    marker_size: int | None = None  # Data point size in pixels

    # Bar chart options
    bar_gap: float | None = None  # Gap between bars (0-1)
    bar_group_gap: float | None = None  # Gap between bar groups (0-1)

    # Axis options
    tick_angle: int | None = None  # Rotation angle for tick labels
    y_axis_min: float | None = None  # Y-axis minimum value
    y_axis_max: float | None = None  # Y-axis maximum value

    # Chart-specific options
    sort: bool | str | None = None  # Sort order
    horizontal: bool = False  # For bar charts
    stacked: bool = False  # For bar/area charts

    # Additional props
    extra_props: dict[str, Any] = field(default_factory=dict)

    def to_props(self) -> dict[str, Any]:
        """Convert to props dictionary for rendering."""
        props = {}

        if self.x:
            props["x"] = self.x
        if self.y:
            props["y"] = self.y
        if self.y2:
            props["y2"] = self.y2
        if self.value:
            props["value"] = self.value
        if self.series:
            props["series"] = self.series
        if self.x_fmt:
            props["xFmt"] = self.x_fmt
        if self.y_fmt:
            props["yFmt"] = self.y_fmt
        if self.value_fmt:
            props["fmt"] = self.value_fmt
        if self.title:
            props["title"] = self.title
        if self.x_axis_title:
            props["xAxisTitle"] = self.x_axis_title
        if self.y_axis_title:
            props["yAxisTitle"] = self.y_axis_title
        if self.color:
            props["fillColor"] = self.color
        if self.horizontal:
            props["swapXY"] = True
        if self.stacked:
            props["type"] = "stacked"
        if self.sort is not None:
            props["sort"] = self.sort

        # Merge extra props
        props.update(self.extra_props)

        return props


@dataclass
class ChartSpec:
    """
    Specification for a single chart - the input to the chart pipeline.

    This is what the RequirementsAgent produces from user input.
    Much simpler than DashboardSpec since it's just one chart.
    """

    # What the user asked for
    title: str
    description: str  # What question does this chart answer?
    original_request: str  # The raw user input

    # Data requirements
    metric: str  # Primary metric to show (e.g., "revenue", "user count")
    aggregation: str | None = None  # How to aggregate (SUM, COUNT, AVG, etc.)
    dimension: str | None = None  # How to slice the data (e.g., "by month", "by customer")
    filters: list[str] = field(default_factory=list)  # Static filters to bake into query

    # Interactive filters (user-controllable)
    interactive_filters: list[FilterSpec] = field(default_factory=list)

    # Visualization
    chart_type: ChartType = ChartType.BAR_CHART
    horizontal: bool = False  # For bar charts: swap x/y axes

    # Tables to use (from schema)
    relevant_tables: list[str] = field(default_factory=list)

    # Explicit column mappings (LLM-specified, not heuristic-guessed)
    # These tell the chart renderer exactly how to use each SQL output column
    x_column: str | None = None  # Column for X-axis (e.g., "month", "date")
    y_column: str | list[str] | None = None  # Column(s) for Y-axis metrics (e.g., "revenue", ["revenue", "count"])
    series_column: str | None = None  # Column for grouping/coloring (e.g., "plan_tier", "segment")

    def to_prompt_context(self) -> str:
        """Format the spec for inclusion in an LLM prompt."""
        lines = [
            "CHART SPECIFICATION",
            "==================",
            f"Title: {self.title}",
            f"Description: {self.description}",
            f"Chart Type: {self.chart_type.value}",
            "",
            "DATA REQUIREMENTS:",
            f"  Metric: {self.metric}",
        ]

        if self.aggregation:
            lines.append(f"  Aggregation: {self.aggregation}")
        if self.dimension:
            lines.append(f"  Dimension: {self.dimension}")
        if self.filters:
            lines.append(f"  Static Filters: {', '.join(self.filters)}")
        if self.interactive_filters:
            lines.append(f"  Interactive Filters:")
            for f in self.interactive_filters:
                lines.append(f"    - {f.filter_type.value}: {f.name} on {f.options_column or f.date_column}")
        if self.relevant_tables:
            lines.append(f"  Tables: {', '.join(self.relevant_tables)}")

        # Include explicit column mappings if specified
        if self.x_column or self.y_column or self.series_column:
            lines.append("")
            lines.append("COLUMN MAPPINGS:")
            if self.x_column:
                lines.append(f"  X-axis: {self.x_column}")
            if self.y_column:
                y_str = self.y_column if isinstance(self.y_column, str) else ", ".join(self.y_column)
                lines.append(f"  Y-axis: {y_str}")
            if self.series_column:
                lines.append(f"  Series (grouping): {self.series_column}")

        lines.append("")
        lines.append(f"Original Request: {self.original_request}")

        return "\n".join(lines)


@dataclass
class ValidatedChart:
    """
    A chart with validated SQL - ready to render.

    This is the output from the SQLAgent after validation.
    """

    spec: ChartSpec

    # Validated SQL
    query_name: str  # The identifier used (e.g., "monthly_revenue")
    sql: str  # The validated SQL query
    columns: list[str] = field(default_factory=list)  # Output columns from query

    # Chart configuration
    config: ChartConfig = field(default_factory=ChartConfig)

    # Filters (optional)
    filters: list[FilterSpec] = field(default_factory=list)

    # Validation status
    validation_status: str = "valid"  # "valid", "invalid", "pending"
    validation_error: str | None = None
    validation_attempts: int = 0

    def to_prompt_context(self) -> str:
        """Format for LLM prompt context."""
        return f"""VALIDATED CHART
==============
Title: {self.spec.title}
Query Name: {self.query_name}
Chart Type: {self.spec.chart_type.value}
Columns: {', '.join(self.columns)}
Status: {self.validation_status}

SQL:
```sql {self.query_name}
{self.sql}
```
"""


@dataclass
class Chart:
    """
    A stored chart entity - the primary building block.

    Charts are persisted and can be reused across dashboards.
    """

    # Identity
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    # Content
    title: str = ""
    description: str = ""  # What question does this chart answer?

    # SQL and visualization
    query_name: str = ""
    sql: str = ""
    chart_type: ChartType = ChartType.BAR_CHART
    config: ChartConfig = field(default_factory=ChartConfig)

    # Filters (optional)
    filters: list[FilterSpec] = field(default_factory=list)

    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    created_by: str | None = None  # User ID if we have auth

    # Lineage
    original_request: str = ""  # What the user originally asked for
    conversation_id: str | None = None  # Link back to conversation

    # Status
    is_valid: bool = True
    last_error: str | None = None

    @classmethod
    def from_validated(cls, validated: ValidatedChart, conversation_id: str | None = None) -> Chart:
        """Create a Chart from a ValidatedChart."""
        return cls(
            title=validated.spec.title,
            description=validated.spec.description,
            query_name=validated.query_name,
            sql=validated.sql,
            chart_type=validated.spec.chart_type,
            config=validated.config,
            filters=validated.filters,
            original_request=validated.spec.original_request,
            conversation_id=conversation_id,
            is_valid=validated.validation_status == "valid",
            last_error=validated.validation_error,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "query_name": self.query_name,
            "sql": self.sql,
            "chart_type": self.chart_type.value,
            "config": {
                "x": self.config.x,
                "y": self.config.y,
                "y2": self.config.y2,
                "value": self.config.value,
                "series": self.config.series,
                "title": self.config.title,
                "x_axis_title": self.config.x_axis_title,
                "y_axis_title": self.config.y_axis_title,
                "color": self.config.color,
                "fill_color": self.config.fill_color,
                "background_color": self.config.background_color,
                "grid_color": self.config.grid_color,
                "title_font_size": self.config.title_font_size,
                "legend_font_size": self.config.legend_font_size,
                "axis_font_size": self.config.axis_font_size,
                "show_legend": self.config.show_legend,
                "show_grid": self.config.show_grid,
                "show_values": self.config.show_values,
                "line_width": self.config.line_width,
                "marker_size": self.config.marker_size,
                "bar_gap": self.config.bar_gap,
                "bar_group_gap": self.config.bar_group_gap,
                "tick_angle": self.config.tick_angle,
                "y_axis_min": self.config.y_axis_min,
                "y_axis_max": self.config.y_axis_max,
                "horizontal": self.config.horizontal,
                "stacked": self.config.stacked,
                "sort": self.config.sort,
                "x_fmt": self.config.x_fmt,
                "y_fmt": self.config.y_fmt,
                "value_fmt": self.config.value_fmt,
                "extra_props": self.config.extra_props,
            },
            "filters": [f.to_dict() for f in self.filters],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by,
            "original_request": self.original_request,
            "conversation_id": self.conversation_id,
            "is_valid": self.is_valid,
            "last_error": self.last_error,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Chart:
        """Deserialize from dictionary."""
        config_data = data.get("config", {})
        config = ChartConfig(
            # Core data binding
            x=config_data.get("x"),
            y=config_data.get("y"),
            y2=config_data.get("y2"),
            value=config_data.get("value"),
            series=config_data.get("series"),
            # Formatting
            x_fmt=config_data.get("x_fmt"),
            y_fmt=config_data.get("y_fmt"),
            value_fmt=config_data.get("value_fmt"),
            # Labels and titles
            title=config_data.get("title"),
            x_axis_title=config_data.get("x_axis_title"),
            y_axis_title=config_data.get("y_axis_title"),
            # Styling
            color=config_data.get("color"),
            fill_color=config_data.get("fill_color"),
            background_color=config_data.get("background_color"),
            grid_color=config_data.get("grid_color"),
            # Typography
            title_font_size=config_data.get("title_font_size"),
            legend_font_size=config_data.get("legend_font_size"),
            axis_font_size=config_data.get("axis_font_size"),
            # Display options
            show_legend=config_data.get("show_legend"),
            show_grid=config_data.get("show_grid"),
            show_values=config_data.get("show_values"),
            # Line/scatter options
            line_width=config_data.get("line_width"),
            marker_size=config_data.get("marker_size"),
            # Bar chart options
            bar_gap=config_data.get("bar_gap"),
            bar_group_gap=config_data.get("bar_group_gap"),
            # Axis options
            tick_angle=config_data.get("tick_angle"),
            y_axis_min=config_data.get("y_axis_min"),
            y_axis_max=config_data.get("y_axis_max"),
            # Chart-specific options
            horizontal=config_data.get("horizontal", False),
            stacked=config_data.get("stacked", False),
            sort=config_data.get("sort"),
            # Additional props
            extra_props=config_data.get("extra_props", {}),
        )

        # Deserialize filters
        filters_data = data.get("filters", [])
        filters = [FilterSpec.from_dict(f) for f in filters_data]

        return cls(
            id=data.get("id", str(uuid.uuid4())),
            title=data.get("title", ""),
            description=data.get("description", ""),
            query_name=data.get("query_name", ""),
            sql=data.get("sql", ""),
            chart_type=ChartType.from_string(data.get("chart_type", "BarChart")),
            config=config,
            filters=filters,
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(),
            updated_at=datetime.fromisoformat(data["updated_at"]) if "updated_at" in data else datetime.now(),
            created_by=data.get("created_by"),
            original_request=data.get("original_request", ""),
            conversation_id=data.get("conversation_id"),
            is_valid=data.get("is_valid", True),
            last_error=data.get("last_error"),
        )


@dataclass
class DashboardLayout:
    """
    Layout configuration for how charts are arranged in a dashboard.
    """

    # Simple section-based layout
    sections: list[dict[str, Any]] = field(default_factory=list)
    # Each section: {"title": "Section Name", "chart_ids": ["id1", "id2"]}

    def to_dict(self) -> dict[str, Any]:
        return {"sections": self.sections}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DashboardLayout:
        return cls(sections=data.get("sections", []))


@dataclass
class Dashboard:
    """
    A dashboard - a composition of charts with layout.

    Dashboards are lightweight wrappers that reference charts.
    The actual chart content is stored in Chart entities.
    """

    # Identity
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    slug: str = ""  # URL-friendly identifier

    # Content
    title: str = ""
    description: str | None = None

    # Chart references (ordered)
    chart_ids: list[str] = field(default_factory=list)

    # Layout configuration
    layout: DashboardLayout = field(default_factory=DashboardLayout)

    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    created_by: str | None = None

    def add_chart(self, chart_id: str, section: str | None = None) -> None:
        """Add a chart to this dashboard."""
        if chart_id not in self.chart_ids:
            self.chart_ids.append(chart_id)

        # Update layout if section specified
        if section:
            for s in self.layout.sections:
                if s.get("title") == section:
                    if chart_id not in s.get("chart_ids", []):
                        s.setdefault("chart_ids", []).append(chart_id)
                    return
            # Create new section
            self.layout.sections.append({
                "title": section,
                "chart_ids": [chart_id]
            })

        self.updated_at = datetime.now()

    def remove_chart(self, chart_id: str) -> None:
        """Remove a chart from this dashboard."""
        if chart_id in self.chart_ids:
            self.chart_ids.remove(chart_id)

        # Remove from layout sections
        for section in self.layout.sections:
            if chart_id in section.get("chart_ids", []):
                section["chart_ids"].remove(chart_id)

        self.updated_at = datetime.now()

    def reorder_charts(self, chart_ids: list[str]) -> None:
        """Reorder charts in the dashboard."""
        # Validate all IDs are present
        if set(chart_ids) != set(self.chart_ids):
            raise ValueError("Chart IDs must match existing charts")
        self.chart_ids = chart_ids
        self.updated_at = datetime.now()

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "description": self.description,
            "chart_ids": self.chart_ids,
            "layout": self.layout.to_dict(),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Dashboard:
        """Deserialize from dictionary."""
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            slug=data.get("slug", ""),
            title=data.get("title", ""),
            description=data.get("description"),
            chart_ids=data.get("chart_ids", []),
            layout=DashboardLayout.from_dict(data.get("layout", {})),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(),
            updated_at=datetime.fromisoformat(data["updated_at"]) if "updated_at" in data else datetime.now(),
            created_by=data.get("created_by"),
        )
