"""
Feasibility Checker - Validates if a dashboard spec can be fulfilled by the available schema.

This module performs early validation to catch data availability issues BEFORE
attempting to generate SQL queries, preventing wasted cycles and confusing errors.
"""

import re
from dataclasses import dataclass, field

from ..llm.base import Message
from ..llm.claude import get_provider
from .models import DashboardSpec


@dataclass
class FeasibilityResult:
    """Result of a feasibility check."""

    feasible: bool  # Can we build this dashboard at all?
    fully_feasible: bool  # Can we build it completely as requested?
    feasible_parts: list[str] = field(default_factory=list)  # What we CAN do
    infeasible_parts: list[str] = field(default_factory=list)  # What we CANNOT do
    explanation: str = ""  # Human-readable explanation
    suggested_alternative: str | None = None  # What we could build instead


class FeasibilityChecker:
    """
    Checks if a dashboard specification can be fulfilled by the available schema.

    This is a critical early-stage validation that prevents the pipeline from
    attempting to generate dashboards that will inevitably fail due to missing data.
    """

    def __init__(self, provider_name: str | None = None):
        self.llm = get_provider(provider_name)

    def check(self, spec: DashboardSpec, schema_context: str) -> FeasibilityResult:
        """
        Check if the dashboard spec can be fulfilled by the available schema.

        Args:
            spec: The extracted dashboard specification
            schema_context: The database schema documentation

        Returns:
            FeasibilityResult indicating what's possible and what's not
        """
        system_prompt = self._build_system_prompt(schema_context)

        user_prompt = f"""Analyze this dashboard specification and determine what can and cannot be built with the available data.

DASHBOARD SPECIFICATION:
Title: {spec.title}
Business Question: {spec.business_question}

Metrics requested:
{self._format_metrics(spec)}

Visualizations requested:
{self._format_visualizations(spec)}

Relevant tables identified: {', '.join(spec.relevant_tables) if spec.relevant_tables else 'None specified'}

TASK:
1. For each metric and visualization, determine if the required data EXISTS in the schema
2. Be specific about what columns/tables are missing
3. Suggest what CAN be built with the available data

Output your analysis as JSON:
```json
{{
    "fully_feasible": true/false,
    "feasible_parts": ["list of metrics/visualizations that CAN be built"],
    "infeasible_parts": ["list of metrics/visualizations that CANNOT be built with reasons"],
    "explanation": "Brief explanation of the data availability situation",
    "suggested_alternative": "If not fully feasible, describe what dashboard COULD be built instead"
}}
```"""

        messages = [Message(role="user", content=user_prompt)]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=1024,
        )

        return self._parse_response(response.content)

    def _build_system_prompt(self, schema_context: str) -> str:
        """Build the system prompt for feasibility checking."""
        return f"""You are a data availability analyst. Your job is to determine if requested dashboard metrics can be built with the available database schema.

DATABASE SCHEMA:
{schema_context}

CRITICAL RULES:
1. A metric is ONLY feasible if the required columns ACTUALLY EXIST in the schema above
2. Do not assume columns exist - check the schema carefully
3. Common missing data scenarios:
   - "customer_segment" column when only basic customer info exists
   - "churn_date" or "churn_reason" when no churn tracking exists
   - "plan_type" or "subscription_tier" when no subscription data exists
4. Be honest - it's better to catch missing data early than to generate a broken dashboard

OUTPUT FORMAT: JSON only, no other text."""

    def _format_metrics(self, spec: DashboardSpec) -> str:
        """Format metrics for the prompt."""
        if not spec.metrics:
            return "No specific metrics defined"

        lines = []
        for m in spec.metrics:
            lines.append(f"- {m.name}: {m.description} (aggregation: {m.aggregation})")
        return "\n".join(lines)

    def _format_visualizations(self, spec: DashboardSpec) -> str:
        """Format visualizations for the prompt."""
        if not spec.visualizations:
            return "No specific visualizations defined"

        lines = []
        for v in spec.visualizations:
            lines.append(f"- {v.type}: {v.title} - {v.description}")
            if v.dimensions:
                lines.append(f"  Dimensions: {', '.join(v.dimensions)}")
        return "\n".join(lines)

    def _parse_response(self, response: str) -> FeasibilityResult:
        """Parse the LLM response into a FeasibilityResult."""
        import json

        # Extract JSON from response
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            json_str = response.strip()

        try:
            data = json.loads(json_str)

            fully_feasible = data.get("fully_feasible", True)
            feasible_parts = data.get("feasible_parts", [])
            infeasible_parts = data.get("infeasible_parts", [])

            return FeasibilityResult(
                feasible=len(feasible_parts) > 0 or fully_feasible,
                fully_feasible=fully_feasible,
                feasible_parts=feasible_parts,
                infeasible_parts=infeasible_parts,
                explanation=data.get("explanation", ""),
                suggested_alternative=data.get("suggested_alternative"),
            )

        except json.JSONDecodeError:
            # If parsing fails, assume feasible (fallback to current behavior)
            return FeasibilityResult(
                feasible=True,
                fully_feasible=True,
                explanation="Could not parse feasibility check response",
            )
