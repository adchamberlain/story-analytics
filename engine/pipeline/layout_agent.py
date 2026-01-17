"""
Layout Agent - Assembles Evidence markdown dashboards.

This agent focuses ONLY on creating the markdown layout.
It receives validated SQL queries and dashboard specs - no SQL writing needed.
"""

from pathlib import Path

import yaml

from ..llm.base import Message
from ..llm.claude import get_provider
from .models import DashboardSpec, ValidatedQueries


class LayoutAgent:
    """Assembles Evidence markdown dashboards from validated queries."""

    def __init__(self, provider_name: str | None = None):
        self.llm = get_provider(provider_name)
        self._prompt_config = self._load_prompt_config()
        self._components_config = self._load_components_config()

    def _load_prompt_config(self) -> dict:
        """Load the layout agent prompt configuration."""
        prompt_path = Path(__file__).parent.parent / "prompts" / "pipeline" / "layout.yaml"
        with open(prompt_path) as f:
            return yaml.safe_load(f)

    def _load_components_config(self) -> dict:
        """Load the Evidence components configuration."""
        components_path = Path(__file__).parent.parent / "components" / "evidence.yaml"
        if components_path.exists():
            with open(components_path) as f:
                return yaml.safe_load(f)
        return {}

    def _build_system_prompt(self) -> str:
        """Build the system prompt for this agent."""
        config = self._prompt_config

        parts = [
            config.get("role", ""),
            "",
            config.get("evidence_syntax", ""),
            "",
            config.get("layout_rules", ""),
            "",
            config.get("output_format", ""),
        ]

        return "\n".join(parts)

    def assemble_dashboard(
        self,
        spec: DashboardSpec,
        queries: ValidatedQueries,
    ) -> str:
        """
        Assemble an Evidence markdown dashboard.

        Args:
            spec: The structured dashboard specification
            queries: The validated SQL queries

        Returns:
            Complete Evidence markdown content
        """
        system_prompt = self._build_system_prompt()

        # Build the request with spec and queries
        request = f"""Create an Evidence markdown dashboard using these specifications and queries:

{spec.to_prompt_context()}

{queries.to_prompt_context()}

IMPORTANT:
- Use the SQL queries EXACTLY as provided (they have been validated)
- Create a clean, professional layout
- Focus on the business question: {spec.business_question}
- Output ONLY the markdown, starting with # {spec.title}
"""

        messages = [Message(role="user", content=request)]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=4096,
        )

        markdown = self._clean_markdown(response.content)
        return markdown

    def _clean_markdown(self, content: str) -> str:
        """Clean up the markdown output."""
        # Remove markdown code fence wrappers if present
        if content.startswith("```markdown"):
            content = content[len("```markdown"):].strip()
        if content.startswith("```"):
            content = content[3:].strip()
        if content.endswith("```"):
            content = content[:-3].strip()

        return content
