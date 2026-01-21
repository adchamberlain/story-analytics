"""
Data models for the dashboard generation pipeline.

These models define the structured handoff between pipeline stages,
ensuring clear contracts and reducing information loss.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .feasibility_checker import FeasibilityResult


@dataclass
class DashboardMetadata:
    """
    Metadata for dashboard governance and documentation.

    This provides standardized header information that appears at the top
    of every dashboard for context, ownership, and documentation links.
    """
    description: str | None = None  # 2-3 sentence purpose description
    owner: str | None = None  # Data scientist/analyst name
    team: str | None = None  # Product or business team
    documentation_url: str | None = None  # Link to external docs
    data_sources: list[str] = field(default_factory=list)  # Tables/sources used

    def to_prompt_context(self) -> str:
        """Format metadata for inclusion in an LLM prompt."""
        lines = ["DASHBOARD METADATA", "=================="]
        if self.description:
            lines.append(f"Description: {self.description}")
        if self.owner:
            lines.append(f"Owner: {self.owner}")
        if self.team:
            lines.append(f"Team: {self.team}")
        if self.documentation_url:
            lines.append(f"Documentation: {self.documentation_url}")
        if self.data_sources:
            lines.append(f"Data Sources: {', '.join(self.data_sources)}")
        return "\n".join(lines)


class VisualizationType(Enum):
    """Types of visualizations available in Evidence."""
    LINE_CHART = "LineChart"
    BAR_CHART = "BarChart"
    AREA_CHART = "AreaChart"
    PIE_CHART = "PieChart"
    DATA_TABLE = "DataTable"
    BIG_VALUE = "BigValue"
    SCATTER_PLOT = "ScatterPlot"


@dataclass
class MetricSpec:
    """Specification for a metric to display."""
    name: str  # e.g., "Monthly Revenue"
    description: str  # e.g., "Total revenue aggregated by month"
    aggregation: str  # e.g., "SUM", "COUNT", "AVG"
    column: str | None = None  # e.g., "amount" - the column to aggregate
    filters: list[str] = field(default_factory=list)  # e.g., ["last 12 months"]


@dataclass
class VisualizationSpec:
    """Specification for a visualization."""
    type: str  # e.g., "LineChart", "BarChart"
    title: str  # e.g., "Revenue Over Time"
    description: str  # What this visualization shows
    metrics: list[str]  # References to MetricSpec names
    dimensions: list[str]  # e.g., ["month", "customer_segment"]
    notes: str | None = None  # Any special considerations


@dataclass
class DashboardSpec:
    """
    Structured specification for a dashboard.

    This is the output of the RequirementsAgent and input to SQLAgent.
    It captures the user's intent in a structured format.
    """
    title: str
    business_question: str  # What decision does this help make?
    target_audience: str  # Who will use this dashboard?

    # Dashboard metadata for governance and documentation
    metadata: DashboardMetadata = field(default_factory=DashboardMetadata)

    # Metrics to calculate
    metrics: list[MetricSpec] = field(default_factory=list)

    # How to slice the data
    dimensions: list[str] = field(default_factory=list)  # e.g., ["time", "segment"]

    # Suggested visualizations
    visualizations: list[VisualizationSpec] = field(default_factory=list)

    # Tables likely needed (inferred from metrics)
    relevant_tables: list[str] = field(default_factory=list)

    # Any filters mentioned
    filters: list[str] = field(default_factory=list)  # e.g., ["last 12 months", "active customers"]

    # Original user request (for context)
    original_request: str = ""

    # Feasibility check result (set by pipeline)
    feasibility_result: FeasibilityResult | None = None

    def to_prompt_context(self) -> str:
        """Format the spec for inclusion in an LLM prompt."""
        lines = [
            f"DASHBOARD SPECIFICATION",
            f"======================",
            f"Title: {self.title}",
            f"Business Question: {self.business_question}",
            f"Target Audience: {self.target_audience}",
            f"",
        ]

        # Include metadata if present
        if self.metadata:
            lines.append(self.metadata.to_prompt_context())
            lines.append("")

        lines.append("METRICS TO CALCULATE:")

        for metric in self.metrics:
            lines.append(f"  - {metric.name}: {metric.description}")
            if metric.column:
                lines.append(f"    Aggregation: {metric.aggregation}({metric.column})")
            if metric.filters:
                lines.append(f"    Filters: {', '.join(metric.filters)}")

        if self.dimensions:
            lines.append(f"")
            lines.append(f"DIMENSIONS (how to slice data):")
            for dim in self.dimensions:
                lines.append(f"  - {dim}")

        if self.visualizations:
            lines.append(f"")
            lines.append(f"VISUALIZATIONS:")
            for viz in self.visualizations:
                lines.append(f"  - {viz.type}: {viz.title}")
                lines.append(f"    Shows: {viz.description}")

        if self.relevant_tables:
            lines.append(f"")
            lines.append(f"RELEVANT TABLES:")
            for table in self.relevant_tables:
                lines.append(f"  - {table}")

        if self.filters:
            lines.append(f"")
            lines.append(f"FILTERS TO APPLY:")
            for f in self.filters:
                lines.append(f"  - {f}")

        return "\n".join(lines)


@dataclass
class QuerySpec:
    """Specification for a single SQL query."""
    name: str  # Query identifier (used in markdown as ```sql {name})
    purpose: str  # What this query provides
    sql: str  # The actual SQL
    columns: list[str] = field(default_factory=list)  # Expected output columns
    validation_status: str = "pending"  # "pending", "valid", "invalid"
    validation_error: str | None = None


@dataclass
class ValidatedQueries:
    """
    Collection of validated SQL queries.

    This is the output of SQLAgent and input to LayoutAgent.
    All queries have been tested against DuckDB.
    """
    queries: list[QuerySpec] = field(default_factory=list)
    all_valid: bool = False
    validation_attempts: int = 0

    def get_query(self, name: str) -> QuerySpec | None:
        """Get a query by name."""
        for q in self.queries:
            if q.name == name:
                return q
        return None

    def to_prompt_context(self) -> str:
        """Format queries for inclusion in an LLM prompt."""
        lines = [
            "VALIDATED SQL QUERIES",
            "=====================",
            f"Total queries: {len(self.queries)}",
            f"All valid: {self.all_valid}",
            "",
        ]

        for query in self.queries:
            status = "VALID" if query.validation_status == "valid" else "INVALID"
            lines.append(f"Query: {query.name} [{status}]")
            lines.append(f"Purpose: {query.purpose}")
            lines.append(f"Columns: {', '.join(query.columns)}")
            lines.append(f"SQL:")
            lines.append(f"```sql {query.name}")
            lines.append(query.sql)
            lines.append("```")
            if query.validation_error:
                lines.append(f"Error: {query.validation_error}")
            lines.append("")

        return "\n".join(lines)


@dataclass
class PipelineResult:
    """Final result from the dashboard generation pipeline."""
    success: bool
    dashboard_spec: DashboardSpec | None = None
    validated_queries: ValidatedQueries | None = None
    markdown: str | None = None
    error: str | None = None

    # Feasibility check result (for partial feasibility or failure explanation)
    feasibility_result: FeasibilityResult | None = None

    # Debugging info
    requirements_response: str | None = None
    sql_response: str | None = None
    layout_response: str | None = None
