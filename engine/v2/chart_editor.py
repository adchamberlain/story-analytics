"""
Chart Editor: LLM pipeline for editing chart configs via natural language.

Takes current config + user message → returns updated config + explanation.
No SQL changes — only visual/config modifications.
"""

from __future__ import annotations

import json
import re
import traceback
from dataclasses import dataclass

from ..llm.base import Message
from ..llm.claude import get_provider


@dataclass
class EditResult:
    """Result of the chart edit pipeline."""
    success: bool
    config: dict | None = None
    explanation: str | None = None
    error: str | None = None


SYSTEM_PROMPT = """You are a chart configuration editor. You receive the current chart config JSON, available columns, and a user request. Return the updated config JSON.

RULES:
1. Only modify config fields — never change SQL or data.
2. Return the complete updated config (not a diff).
3. Keep changes minimal — only change what the user asked for.
4. If the user's request doesn't make sense, explain why and return the config unchanged.

VALID CHART TYPES:
- LineChart: Time series or continuous trends
- BarChart: Comparing categories (supports horizontal, stacked)
- AreaChart: Time series with volume emphasis
- ScatterPlot: Relationship between two numeric variables
- Histogram: Distribution of a single variable

CONFIG FIELDS:
- chart_type: One of the valid chart types above
- title: Chart title (string)
- subtitle: Chart subtitle (string)
- source: Data source attribution (string)
- x: Column name for x-axis (must be from available columns)
- y: Column name for y-axis (must be from available columns)
- series: Column name for color grouping, or null
- horizontal: Boolean (only applies to BarChart)
- sort: Boolean (sort bars by value)
- stacked: Boolean (only applies to BarChart with series)
- show_grid: Boolean
- show_legend: Boolean
- show_values: Boolean
- palette: One of "default", "blues", "reds", "greens"
- x_axis_title: Custom x-axis label (string)
- y_axis_title: Custom y-axis label (string)
- annotations: Object with three arrays: lines, texts, ranges
  - lines: Array of reference lines. Each has: id (string), axis ("x"|"y"), value (number or string), label (optional string), color (optional hex string, default "#e45756")
  - texts: Array of text annotations. Each has: id (string), x (number or string), y (number or string), text (string), fontSize (optional number, default 12), color (optional hex string)
  - ranges: Array of highlight ranges. Each has: id (string), axis ("x"|"y"), start (number or string), end (number or string), label (optional string), color (optional hex string, default "#e45756"), opacity (optional number 0-1, default 0.1)

ANNOTATION EXAMPLES:
- "Add a target line at 1000" → add to annotations.lines: {"id": "ann-1", "axis": "y", "value": 1000, "label": "Target", "color": "#e45756"}
- "Highlight Q4" → add to annotations.ranges: {"id": "ann-2", "axis": "x", "start": "Oct", "end": "Dec", "label": "Q4", "color": "#4e79a7", "opacity": 0.1}
- "Add a note at (Jan, 500) saying 'Launch'" → add to annotations.texts: {"id": "ann-3", "x": "Jan", "y": 500, "text": "Launch"}

When adding annotations, generate unique IDs like "ann-{timestamp}". Preserve existing annotations unless the user explicitly asks to remove them.
- "Annotate the peak" → find max y-value from data context, add to annotations.texts with the actual x,y coordinates

DATA AWARENESS:
You may receive a DATA CONTEXT section with column statistics and sample rows from the chart's query result. Use this to:
- Suggest data-aware titles and subtitles that reference actual values, trends, and date ranges
- Place annotations at real data points (e.g., "annotate the peak" → find the max y-value and its x-coordinate from the data, create an annotation there)
- When asked for a title, reference meaningful data (e.g., "Unemployment surged to 14.7% in April 2020")

OUTPUT FORMAT:
Return a single JSON object (no markdown code fences):
{
  "config": { ... complete updated config ... },
  "explanation": "Brief description of what was changed"
}"""


def _format_data_context(data_summary: dict) -> str:
    """Format a data summary dict into concise text for the LLM prompt."""
    lines = [
        "DATA CONTEXT (chart query result):",
        f"Rows: {data_summary.get('row_count', 0)}",
        "Columns:",
    ]

    for col_name, col_info in data_summary.get("columns", {}).items():
        col_type = col_info.get("type", "unknown")
        distinct = col_info.get("distinct_count", "?")
        parts = [f"  - {col_name} ({col_type}): {distinct} distinct"]

        col_min = col_info.get("min")
        col_max = col_info.get("max")
        if col_min is not None and col_max is not None:
            parts.append(f"range {col_min} \u2192 {col_max}")

        mean = col_info.get("mean")
        if mean is not None:
            parts.append(f"mean={mean}")

        lines.append(", ".join(parts))

    sample_rows = data_summary.get("sample_rows", [])
    if sample_rows:
        lines.append("Sample rows:")
        for row in sample_rows[:5]:
            row_parts = [f"{k}={v}" for k, v in row.items()]
            lines.append(f"  {', '.join(row_parts)}")
        if len(sample_rows) > 5:
            lines.append(f"  ... ({len(sample_rows)} rows total)")

    return "\n".join(lines)


def edit_chart(
    current_config: dict,
    user_message: str,
    columns: list[str],
    provider_name: str | None = None,
    data_summary: dict | None = None,
) -> EditResult:
    """
    Edit a chart config based on a natural language request.

    Args:
        current_config: Current chart configuration dict
        user_message: User's edit request
        columns: Available column names from the data
        provider_name: LLM provider to use
        data_summary: Optional data summary with column stats and sample rows

    Returns:
        EditResult with updated config and explanation
    """
    llm = get_provider(provider_name)

    parts = [
        f"Current config:\n{json.dumps(current_config, indent=2)}\n",
        f"Available columns: {json.dumps(columns)}\n",
    ]

    if data_summary:
        parts.append(_format_data_context(data_summary) + "\n")

    parts.append(f"User request: {user_message}")

    user_content = "\n".join(parts)

    messages = [Message(role="user", content=user_content)]

    try:
        response = llm.generate(
            messages=messages,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=1024,
        )
    except Exception as e:
        traceback.print_exc()
        return EditResult(success=False, error=f"LLM call failed: {e}")

    return _parse_edit_response(response.content)


def _parse_edit_response(response: str) -> EditResult:
    """Parse the LLM response into an EditResult."""
    json_str = response.strip()

    # Remove markdown code fences if present
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
    if json_match:
        json_str = json_match.group(1).strip()

    # If no fences, extract the first complete JSON object (LLMs often append explanation text)
    if not json_match:
        open_idx = json_str.find("{")
        if open_idx >= 0:
            depth = 0
            for i, ch in enumerate(json_str[open_idx:], start=open_idx):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        json_str = json_str[open_idx : i + 1]
                        break

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        return EditResult(
            success=False,
            error=f"Failed to parse LLM response as JSON: {e}\nResponse: {response[:500]}",
        )

    config = data.get("config")
    if not config or not isinstance(config, dict):
        return EditResult(
            success=False,
            error="LLM response missing 'config' field",
        )

    return EditResult(
        success=True,
        config=config,
        explanation=data.get("explanation", "Config updated."),
    )
