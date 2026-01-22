"""
Chart and Dashboard data models for the chart-first architecture.

Key concepts:
- ChartSpec: User's intent for a single chart (input to pipeline)
- ValidatedChart: Chart with validated SQL (output from SQLAgent)
- Chart: Stored chart entity with all metadata
- Dashboard: Collection of charts with layout configuration
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class FilterType(Enum):
    """Types of filter/input components available in Evidence."""

    DROPDOWN = "Dropdown"
    DATE_RANGE = "DateRange"  # Evidence uses DateRange, not DateRangePicker
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

    def to_evidence_component(self) -> str:
        """Generate the Evidence component markup."""
        if self.filter_type == FilterType.DROPDOWN:
            props = [f'name="{self.name}"']
            if self.options_query_name:
                props.append(f"data={{{self.options_query_name}}}")
            if self.options_column:
                props.append(f'value="{self.options_column}"')
            if self.title:
                props.append(f'title="{self.title}"')
            if self.default_value:
                props.append(f'defaultValue="{self.default_value}"')
            return f"<Dropdown {' '.join(props)} />"

        elif self.filter_type == FilterType.DATE_RANGE:
            props = [f'name="{self.name}"']
            if self.title:
                props.append(f'title="{self.title}"')
            # DateRange can use data+dates props OR start+end props
            # We'll use presetRanges for common date filtering
            props.append('presetRanges={["Last 7 Days", "Last 30 Days", "Last 90 Days", "Last 12 Months", "Year to Date", "All Time"]}')
            if self.default_start:
                props.append(f'start="{self.default_start}"')
            if self.default_end:
                props.append(f'end="{self.default_end}"')
            return f"<DateRange {' '.join(props)} />"

        elif self.filter_type == FilterType.TEXT_INPUT:
            props = [f'name="{self.name}"']
            if self.title:
                props.append(f'title="{self.title}"')
            if self.default_value:
                props.append(f'defaultValue="{self.default_value}"')
            return f"<TextInput {' '.join(props)} />"

        elif self.filter_type == FilterType.BUTTON_GROUP:
            props = [f'name="{self.name}"']
            if self.options_query_name:
                props.append(f"data={{{self.options_query_name}}}")
            if self.options_column:
                props.append(f'value="{self.options_column}"')
            if self.title:
                props.append(f'title="{self.title}"')
            if self.default_value:
                props.append(f'defaultValue="{self.default_value}"')
            return f"<ButtonGroup {' '.join(props)} />"

        elif self.filter_type == FilterType.SLIDER:
            props = [f'name="{self.name}"']
            if self.min_value is not None:
                props.append(f"min={{{self.min_value}}}")
            if self.max_value is not None:
                props.append(f"max={{{self.max_value}}}")
            if self.step is not None:
                props.append(f"step={{{self.step}}}")
            if self.title:
                props.append(f'title="{self.title}"')
            if self.default_value:
                props.append(f"defaultValue={{{self.default_value}}}")
            return f"<Slider {' '.join(props)} />"

        return ""

    def get_sql_variable(self) -> str:
        """Get the SQL variable syntax for this filter."""
        if self.filter_type == FilterType.DATE_RANGE_PICKER:
            # DateRangePicker creates .start and .end
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
    """Types of chart visualizations available in Evidence."""

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
        }
        return mapping.get(normalized, cls.BAR_CHART)


@dataclass
class ChartConfig:
    """
    Visual configuration for a chart component.

    These are the Evidence component props that control appearance.
    """

    # Core data binding
    x: str | None = None  # X-axis column
    y: str | list[str] | None = None  # Y-axis column(s)
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

    # Chart-specific options
    sort: bool | str | None = None  # Sort order
    horizontal: bool = False  # For bar charts
    stacked: bool = False  # For bar/area charts

    # Additional Evidence props
    extra_props: dict[str, Any] = field(default_factory=dict)

    def to_evidence_props(self) -> dict[str, Any]:
        """Convert to Evidence component props dictionary."""
        props = {}

        if self.x:
            props["x"] = self.x
        if self.y:
            props["y"] = self.y
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

    # Tables to use (from schema)
    relevant_tables: list[str] = field(default_factory=list)

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
    query_name: str  # The identifier used in Evidence (e.g., "monthly_revenue")
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

    def to_evidence_markdown(self) -> str:
        """Generate the Evidence markdown for this chart."""
        lines = []

        # First, render filter option queries (if any)
        for f in self.filters:
            if f.options_query and f.options_query_name:
                lines.append(f"```sql {f.options_query_name}")
                lines.append(f.options_query.strip())
                lines.append("```")
                lines.append("")

        # Render filter components (if any)
        if self.filters:
            for f in self.filters:
                lines.append(f.to_evidence_component())
            lines.append("")

        # Main SQL query block
        lines.append(f"```sql {self.query_name}")
        lines.append(self.sql.strip())
        lines.append("```")
        lines.append("")

        # Chart component
        chart_type = self.spec.chart_type.value
        props = self.config.to_evidence_props()

        # Build component string
        prop_strings = [f"data={{{self.query_name}}}"]

        for key, value in props.items():
            if isinstance(value, bool):
                prop_strings.append(f"{key}={{{str(value).lower()}}}")
            elif isinstance(value, str):
                prop_strings.append(f'{key}="{value}"')
            elif isinstance(value, dict):
                # Serialize dicts (like echartsOptions) as JSON
                json_str = json.dumps(value)
                prop_strings.append(f"{key}={{{json_str}}}")
            elif isinstance(value, list):
                items = ", ".join(f'"{v}"' if isinstance(v, str) else str(v) for v in value)
                prop_strings.append(f"{key}={{[{items}]}}")
            else:
                prop_strings.append(f"{key}={{{value}}}")

        if len(prop_strings) <= 3:
            # Single line for simple charts
            lines.append(f"<{chart_type} {' '.join(prop_strings)} />")
        else:
            # Multi-line for complex charts
            lines.append(f"<{chart_type}")
            for prop in prop_strings:
                lines.append(f"    {prop}")
            lines.append("/>")

        return "\n".join(lines)

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
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    created_by: str | None = None  # User ID if we have auth

    # Lineage
    original_request: str = ""  # What the user originally asked for
    conversation_id: str | None = None  # Link back to conversation

    # Status
    is_valid: bool = True
    last_error: str | None = None

    def to_evidence_markdown(self) -> str:
        """Generate Evidence markdown for this chart."""
        lines = []

        # First, render filter option queries (if any)
        for f in self.filters:
            if f.options_query and f.options_query_name:
                lines.append(f"```sql {f.options_query_name}")
                lines.append(f.options_query.strip())
                lines.append("```")
                lines.append("")

        # Render filter components (if any)
        if self.filters:
            for f in self.filters:
                lines.append(f.to_evidence_component())
            lines.append("")

        # Main SQL query block
        lines.append(f"```sql {self.query_name}")
        lines.append(self.sql.strip())
        lines.append("```")
        lines.append("")

        # Chart component
        chart_type = self.chart_type.value
        props = self.config.to_evidence_props()

        # Build component string
        prop_strings = [f"data={{{self.query_name}}}"]

        for key, value in props.items():
            if isinstance(value, bool):
                prop_strings.append(f"{key}={{{str(value).lower()}}}")
            elif isinstance(value, str):
                prop_strings.append(f'{key}="{value}"')
            elif isinstance(value, dict):
                # Serialize dicts (like echartsOptions) as JSON
                json_str = json.dumps(value)
                prop_strings.append(f"{key}={{{json_str}}}")
            elif isinstance(value, list):
                items = ", ".join(f'"{v}"' if isinstance(v, str) else str(v) for v in value)
                prop_strings.append(f"{key}={{[{items}]}}")
            else:
                prop_strings.append(f"{key}={{{value}}}")

        lines.append(f"<{chart_type}")
        for prop in prop_strings:
            lines.append(f"    {prop}")
        lines.append("/>")

        return "\n".join(lines)

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
                "value": self.config.value,
                "series": self.config.series,
                "title": self.config.title,
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
            x=config_data.get("x"),
            y=config_data.get("y"),
            value=config_data.get("value"),
            series=config_data.get("series"),
            title=config_data.get("title"),
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

    # Future: grid-based positioning
    # grid: list[dict] = field(default_factory=list)
    # Each grid item: {"chart_id": "...", "row": 0, "col": 0, "width": 6, "height": 2}

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
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
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

    def to_evidence_markdown(self, charts: list[Chart]) -> str:
        """
        Generate complete Evidence markdown for the dashboard.

        Args:
            charts: The Chart entities referenced by this dashboard

        Returns:
            Complete Evidence markdown string
        """
        lines = []

        # Title
        lines.append(f"# {self.title}")
        lines.append("")

        if self.description:
            lines.append(self.description)
            lines.append("")

        # Build chart lookup
        chart_lookup = {c.id: c for c in charts}

        # If we have sections, use them
        if self.layout.sections:
            for section in self.layout.sections:
                section_title = section.get("title")
                section_chart_ids = section.get("chart_ids", [])

                if section_title:
                    lines.append(f"## {section_title}")
                    lines.append("")

                for chart_id in section_chart_ids:
                    chart = chart_lookup.get(chart_id)
                    if chart:
                        lines.append(chart.to_evidence_markdown())
                        lines.append("")
        else:
            # No sections, just render charts in order
            for chart_id in self.chart_ids:
                chart = chart_lookup.get(chart_id)
                if chart:
                    lines.append(chart.to_evidence_markdown())
                    lines.append("")

        return "\n".join(lines)

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
