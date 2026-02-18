"""
Chart Proposer: 2-stage AI pipeline for proposing charts from CSV data.

Stage 1: LLM examines schema → proposes chart type, axis mappings, title, SQL
Stage 2: Execute SQL against DuckDB → assemble chart config + data

This is a simplified version of the v1 ChartPipeline, purpose-built for
CSV data where the user hasn't specified what they want — the AI decides.
"""

from __future__ import annotations

import json
import re
import traceback
from dataclasses import dataclass, field

from ..llm.base import Message
from ..llm.claude import get_provider
from .schema_analyzer import DataProfile, build_schema_context


@dataclass
class ProposedChart:
    """Result of the chart proposal pipeline."""
    success: bool

    # Chart definition
    chart_type: str | None = None
    title: str | None = None
    subtitle: str | None = None
    source: str | None = None
    x: str | None = None
    y: str | None = None
    series: str | None = None
    horizontal: bool = False
    sort: bool = True
    reasoning: str | None = None

    # SQL + data
    sql: str | None = None
    data: list[dict] | None = None
    columns: list[str] = field(default_factory=list)

    # Error
    error: str | None = None


SYSTEM_PROMPT = """You are a data visualization expert. Given a dataset schema, propose the single best chart to visualize this data.

RULES:
1. Pick the chart type that best reveals the story in the data.
2. Generate a DuckDB SQL query that shapes the data for the chart.
3. The query should aggregate, sort, and limit data appropriately (max 50 rows for bar charts, max 500 for line/scatter).
4. Write a clear, publication-quality title and subtitle.
5. The SQL must be valid DuckDB syntax.

CHART TYPES (pick one):
- LineChart: For time series or continuous trends. Needs a date/time x-axis.
- BarChart: For comparing categories. Set horizontal=true for long labels.
- AreaChart: For time series with emphasis on volume/magnitude.
- ScatterPlot: For showing relationship between two numeric variables.
- Histogram: For showing distribution of a single numeric variable.

DuckDB SQL REMINDERS:
- Use STRFTIME('%Y-%m', column) for date formatting, NOT TO_CHAR
- Use DATE_TRUNC('month', column) for date grouping
- Use COALESCE(x, default) not NVL or IFNULL
- Use CASE WHEN ... THEN ... ELSE ... END not IFF
- Always alias computed columns clearly
- The table name is provided in the schema — use it exactly as given

OUTPUT FORMAT:
Return a single JSON object (no markdown code fences):
{
  "chart_type": "LineChart|BarChart|AreaChart|ScatterPlot|Histogram",
  "title": "Publication-quality chart title",
  "subtitle": "One-line description of what the chart shows",
  "reasoning": "1-2 sentences explaining why this chart type was chosen",
  "sql": "SELECT ... FROM table_name ...",
  "x": "column_name_for_x_axis",
  "y": "column_name_for_y_axis",
  "series": "column_name_for_color_grouping_or_null",
  "horizontal": false,
  "sort": true,
  "source": "Data source attribution"
}"""


def propose_chart(
    profile: DataProfile,
    table_name: str,
    user_hint: str | None = None,
    provider_name: str | None = None,
) -> ProposedChart:
    """
    Propose the best chart for a dataset.

    Args:
        profile: Schema profile from the uploaded CSV
        table_name: DuckDB table name (e.g., "src_abc123")
        user_hint: Optional user guidance (e.g., "show me a trend over time")
        provider_name: LLM provider to use

    Returns:
        ProposedChart with chart config, SQL, and reasoning
    """
    llm = get_provider(provider_name)
    schema_context = build_schema_context(profile, table_name)

    user_message = f"Here is the dataset schema:\n\n{schema_context}"
    if user_hint:
        user_message += f"\n\nUser guidance: {user_hint}"
    else:
        user_message += "\n\nPropose the single best chart to visualize this data."

    messages = [Message(role="user", content=user_message)]

    try:
        response = llm.generate(
            messages=messages,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=2048,
        )
    except Exception as e:
        traceback.print_exc()
        return ProposedChart(success=False, error=f"LLM call failed: {e}")

    return _parse_proposal(response.content)


def _parse_proposal(response: str) -> ProposedChart:
    """Parse the LLM response into a ProposedChart."""
    # Try to extract JSON from the response
    json_str = response.strip()

    # Remove markdown code fences if present
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
    if json_match:
        json_str = json_match.group(1).strip()

    # If no fences, extract the first complete JSON object using the standard parser
    # (the naive brace-counter fails on braces inside JSON string values)
    if not json_match:
        open_idx = json_str.find("{")
        if open_idx >= 0:
            try:
                decoder = json.JSONDecoder()
                obj, _ = decoder.raw_decode(json_str, open_idx)
                json_str = json.dumps(obj)
            except json.JSONDecodeError:
                pass  # Fall through to the main parse attempt

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        return ProposedChart(
            success=False,
            error=f"Failed to parse LLM response as JSON: {e}\nResponse: {response[:500]}",
        )

    if not isinstance(data, dict):
        return ProposedChart(
            success=False,
            error=f"LLM response must be a JSON object, got {type(data).__name__}",
        )

    # Normalize string "null" → None (LLMs sometimes return the literal string)
    def _nullable(val: str | None) -> str | None:
        if isinstance(val, str) and val.strip().lower() == "null":
            return None
        return val

    return ProposedChart(
        success=True,
        chart_type=data.get("chart_type", "BarChart"),
        title=_nullable(data.get("title")),
        subtitle=_nullable(data.get("subtitle")),
        source=_nullable(data.get("source")),
        x=_nullable(data.get("x")),
        y=_nullable(data.get("y")),
        series=_nullable(data.get("series")),
        horizontal=data.get("horizontal", False),
        sort=data.get("sort", True),
        reasoning=data.get("reasoning"),
        sql=data.get("sql"),
    )
