"""
Evidence markdown generator.

Converts structured dashboard specifications into Evidence markdown files.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import get_config


@dataclass
class SQLQuery:
    """Represents a SQL query in an Evidence dashboard."""

    name: str
    sql: str
    source: str = "snowflake_saas"


@dataclass
class Chart:
    """Represents a chart component."""

    chart_type: str  # LineChart, BarChart, AreaChart, etc.
    data: str  # Query name reference
    x: str
    y: str | list[str]
    title: str | None = None
    extra_props: dict[str, Any] = field(default_factory=dict)


@dataclass
class DataTable:
    """Represents a data table component."""

    data: str  # Query name reference
    title: str | None = None


@dataclass
class Dropdown:
    """Represents a dropdown filter."""

    name: str
    data: str  # Query name reference
    value: str  # Column for values
    title: str | None = None
    default_value: str | None = None


@dataclass
class BigValue:
    """Represents a big value / KPI card."""

    data: str
    value: str
    title: str | None = None


@dataclass
class DashboardSpec:
    """Complete specification for a dashboard."""

    title: str
    slug: str
    description: str | None = None
    queries: list[SQLQuery] = field(default_factory=list)
    dropdowns: list[Dropdown] = field(default_factory=list)
    components: list[Chart | DataTable | BigValue] = field(default_factory=list)
    sections: list[dict[str, Any]] = field(default_factory=list)


class EvidenceGenerator:
    """Generate Evidence markdown from dashboard specifications."""

    def __init__(self):
        self.config = get_config()

    def generate_markdown(self, spec: DashboardSpec) -> str:
        """
        Generate Evidence markdown from a dashboard specification.

        Args:
            spec: Dashboard specification.

        Returns:
            Generated markdown string.
        """
        lines = []

        # Title
        lines.append(f"# {spec.title}")
        lines.append("")

        if spec.description:
            lines.append(spec.description)
            lines.append("")

        # Queries
        for query in spec.queries:
            lines.append(f"```sql {query.name}")
            lines.append(query.sql.strip())
            lines.append("```")
            lines.append("")

        # Dropdowns
        for dropdown in spec.dropdowns:
            props = [f'data={{{{"{dropdown.data}"}}}}', f'value="{dropdown.value}"']
            if dropdown.title:
                props.append(f'title="{dropdown.title}"')
            if dropdown.default_value:
                props.append(f'defaultValue="{dropdown.default_value}"')

            lines.append(f'<Dropdown name="{dropdown.name}" {" ".join(props)} />')
            lines.append("")

        # Components organized into sections
        if spec.sections:
            for section in spec.sections:
                if section.get("title"):
                    lines.append(f"## {section['title']}")
                    lines.append("")

                for component in section.get("components", []):
                    lines.append(self._render_component(component))
                    lines.append("")
        else:
            # No sections, just render all components
            for component in spec.components:
                lines.append(self._render_component(component))
                lines.append("")

        return "\n".join(lines)

    def _render_component(self, component: Chart | DataTable | BigValue) -> str:
        """Render a single component to markdown."""
        if isinstance(component, Chart):
            return self._render_chart(component)
        elif isinstance(component, DataTable):
            return self._render_table(component)
        elif isinstance(component, BigValue):
            return self._render_big_value(component)
        else:
            return f"<!-- Unknown component type: {type(component)} -->"

    def _render_chart(self, chart: Chart) -> str:
        """Render a chart component."""
        props = [f"data={{{chart.data}}}"]

        props.append(f'x="{chart.x}"')

        if isinstance(chart.y, list):
            y_val = "[" + ", ".join(f'"{y}"' for y in chart.y) + "]"
            props.append(f"y={{{y_val}}}")
        else:
            props.append(f'y="{chart.y}"')

        if chart.title:
            props.append(f'title="{chart.title}"')

        for key, value in chart.extra_props.items():
            if isinstance(value, bool):
                props.append(f"{key}={{{str(value).lower()}}}")
            elif isinstance(value, str):
                props.append(f'{key}="{value}"')
            else:
                props.append(f"{key}={{{value}}}")

        return f"<{chart.chart_type}\n    {chr(10).join('    ' + p for p in props)}\n/>"

    def _render_table(self, table: DataTable) -> str:
        """Render a data table component."""
        props = [f"data={{{table.data}}}"]
        if table.title:
            props.append(f'title="{table.title}"')
        return f"<DataTable {' '.join(props)} />"

    def _render_big_value(self, bv: BigValue) -> str:
        """Render a big value component."""
        props = [f"data={{{bv.data}}}", f'value="{bv.value}"']
        if bv.title:
            props.append(f'title="{bv.title}"')
        return f"<BigValue {' '.join(props)} />"

    def write_dashboard(self, spec: DashboardSpec) -> Path:
        """
        Write a dashboard to the pages directory.

        Args:
            spec: Dashboard specification.

        Returns:
            Path to the created file.
        """
        markdown = self.generate_markdown(spec)

        # Evidence expects: pages_dir/slug/+page.md
        dashboard_dir = self.config.pages_dir / spec.slug
        dashboard_dir.mkdir(parents=True, exist_ok=True)
        file_path = dashboard_dir / "+page.md"

        # Create backup if file exists
        if file_path.exists():
            backup_path = file_path.with_suffix(".md.bak")
            backup_path.write_text(file_path.read_text())

        file_path.write_text(markdown)
        return file_path

    def create_dashboard_from_llm_output(self, llm_output: str, title: str) -> Path:
        """
        Create a dashboard directly from LLM-generated markdown.

        This is a simpler path when the LLM generates complete Evidence markdown.

        Args:
            llm_output: Complete Evidence markdown from LLM.
            title: Dashboard title for generating the slug.

        Returns:
            Path to the created file.
        """
        # Generate slug from title
        slug = self._slugify(title)

        # Evidence expects: pages_dir/slug/+page.md
        dashboard_dir = self.config.pages_dir / slug
        dashboard_dir.mkdir(parents=True, exist_ok=True)
        file_path = dashboard_dir / "+page.md"

        # Create backup if file exists
        if file_path.exists():
            backup_path = file_path.with_suffix(".md.bak")
            backup_path.write_text(file_path.read_text())

        file_path.write_text(llm_output)
        return file_path

    def _slugify(self, text: str) -> str:
        """Convert text to a URL-friendly slug."""
        # Convert to lowercase
        text = text.lower()
        # Replace spaces and special chars with hyphens
        text = re.sub(r"[^a-z0-9]+", "-", text)
        # Remove leading/trailing hyphens
        text = text.strip("-")
        return text


def create_dashboard(spec: DashboardSpec) -> Path:
    """Convenience function to create a dashboard."""
    generator = EvidenceGenerator()
    return generator.write_dashboard(spec)


def fix_format_strings(markdown: str) -> str:
    """
    Fix common format string mistakes in Evidence markdown.

    LLMs often generate Python-style format strings like fmt="$,.0f" instead of
    Evidence keywords like fmt="usd0". This function automatically fixes them.
    """
    # Map of wrong format strings to correct Evidence keywords
    replacements = [
        # Currency formats (with $ prefix)
        (r'fmt\s*=\s*["\']?\$[,:]*\.?0?f["\']?', 'fmt="usd0"'),
        (r'fmt\s*=\s*["\']?\$[,:]*\.?1f["\']?', 'fmt="usd1"'),
        (r'fmt\s*=\s*["\']?\$[,:]*\.?2f["\']?', 'fmt="usd2"'),
        (r'fmt\s*=\s*["\']?\$\{?:?[,.]?0?f?\}?["\']?', 'fmt="usd0"'),
        (r'fmt\s*=\s*["\']?\$\{?:?[,.]?2f?\}?["\']?', 'fmt="usd2"'),

        # Number formats (no $ prefix, with commas/decimals)
        (r'fmt\s*=\s*["\'][,:]?\.?0f["\']', 'fmt="num0"'),
        (r'fmt\s*=\s*["\'][,:]?\.?1f["\']', 'fmt="num1"'),
        (r'fmt\s*=\s*["\'][,:]?\.?2f["\']', 'fmt="num2"'),
        (r'fmt\s*=\s*["\']\{?:?[,.]?0?f?\}?["\']', 'fmt="num0"'),

        # Percentage formats
        (r'fmt\s*=\s*["\']?\.?0?%["\']?', 'fmt="pct0"'),
        (r'fmt\s*=\s*["\']?\.?1%["\']?', 'fmt="pct1"'),
        (r'fmt\s*=\s*["\']?\.?2%["\']?', 'fmt="pct2"'),

        # Generic wrong patterns with 'f' suffix
        (r'fmt\s*=\s*["\'][^"\']*\.0f["\']', 'fmt="num0"'),
        (r'fmt\s*=\s*["\'][^"\']*\.2f["\']', 'fmt="num2"'),
    ]

    for pattern, replacement in replacements:
        markdown = re.sub(pattern, replacement, markdown, flags=re.IGNORECASE)

    return markdown


def create_dashboard_from_markdown(markdown: str, title: str) -> Path:
    """Convenience function to create a dashboard from raw markdown."""
    # Fix common format string issues before writing
    markdown = fix_format_strings(markdown)

    generator = EvidenceGenerator()
    return generator.create_dashboard_from_llm_output(markdown, title)
