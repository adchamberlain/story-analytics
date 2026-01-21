"""
Requirements Agent - Extracts structured dashboard specifications from user requests.

This agent focuses ONLY on understanding user intent and extracting structured requirements.
It does not write SQL or markdown.
"""

import json
import re
from pathlib import Path

import yaml

from ..llm.base import Message
from ..llm.claude import get_provider
from .models import DashboardMetadata, DashboardSpec, MetricSpec, VisualizationSpec


class RequirementsAgent:
    """Extracts structured dashboard requirements from user requests."""

    def __init__(self, provider_name: str | None = None):
        self.llm = get_provider(provider_name)
        self._prompt_config = self._load_prompt_config()

    def _load_prompt_config(self) -> dict:
        """Load the requirements agent prompt configuration."""
        prompt_path = Path(__file__).parent.parent / "prompts" / "pipeline" / "requirements.yaml"
        with open(prompt_path) as f:
            return yaml.safe_load(f)

    def _build_system_prompt(self, schema_context: str) -> str:
        """Build the system prompt for this agent."""
        config = self._prompt_config

        parts = [
            config.get("role", ""),
            "",
            "DATABASE SCHEMA:",
            schema_context,
            "",
            config.get("instructions", ""),
            "",
            config.get("output_format", ""),
        ]

        return "\n".join(parts)

    def extract_spec(self, user_request: str, schema_context: str) -> DashboardSpec:
        """
        Extract a structured dashboard specification from a user request.

        Args:
            user_request: The user's natural language request
            schema_context: The database schema context

        Returns:
            A structured DashboardSpec
        """
        system_prompt = self._build_system_prompt(schema_context)

        messages = [
            Message(role="user", content=f"Create a dashboard specification for this request:\n\n{user_request}")
        ]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.3,
            max_tokens=2048,
        )

        # Parse the JSON response
        spec = self._parse_response(response.content, user_request)
        return spec

    def _parse_response(self, response: str, original_request: str) -> DashboardSpec:
        """Parse the LLM response into a DashboardSpec."""
        # Extract JSON from response (handle potential markdown wrapping)
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            # Try to find raw JSON
            json_str = response.strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            # Return a minimal spec if parsing fails
            print(f"[RequirementsAgent] JSON parse error: {e}")
            return DashboardSpec(
                title="Dashboard",
                business_question="",
                target_audience="",
                original_request=original_request,
            )

        # Build metadata
        metadata_data = data.get("metadata", {})
        metadata = DashboardMetadata(
            description=metadata_data.get("description"),
            owner=metadata_data.get("owner"),
            team=metadata_data.get("team"),
            documentation_url=metadata_data.get("documentation_url"),
            data_sources=data.get("relevant_tables", []),  # Auto-populate from tables
        )

        # Build metrics
        metrics = []
        for m in data.get("metrics", []):
            metrics.append(MetricSpec(
                name=m.get("name", ""),
                description=m.get("description", ""),
                aggregation=m.get("aggregation", ""),
                column=m.get("column"),
                filters=m.get("filters", []),
            ))

        # Build visualizations
        visualizations = []
        for v in data.get("visualizations", []):
            visualizations.append(VisualizationSpec(
                type=v.get("type", ""),
                title=v.get("title", ""),
                description=v.get("description", ""),
                metrics=v.get("metrics", []),
                dimensions=v.get("dimensions", []),
            ))

        return DashboardSpec(
            title=data.get("title", "Dashboard"),
            business_question=data.get("business_question", ""),
            target_audience=data.get("target_audience", ""),
            metadata=metadata,
            metrics=metrics,
            dimensions=data.get("dimensions", []),
            visualizations=visualizations,
            relevant_tables=data.get("relevant_tables", []),
            filters=data.get("filters", []),
            original_request=original_request,
        )
