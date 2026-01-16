"""
Parser for existing Evidence dashboard files.

Extracts structure from Evidence markdown to enable editing.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import get_config


@dataclass
class ParsedQuery:
    """A parsed SQL query from a dashboard."""

    name: str
    sql: str
    start_line: int
    end_line: int


@dataclass
class ParsedComponent:
    """A parsed component from a dashboard."""

    component_type: str  # BarChart, LineChart, DataTable, etc.
    raw_text: str
    props: dict[str, str]
    start_line: int
    end_line: int


@dataclass
class ParsedSection:
    """A parsed section (heading) from a dashboard."""

    title: str
    level: int  # 1 for #, 2 for ##, etc.
    line_number: int


@dataclass
class ParsedDashboard:
    """Complete parsed structure of a dashboard."""

    file_path: Path
    title: str | None
    raw_content: str
    queries: list[ParsedQuery] = field(default_factory=list)
    components: list[ParsedComponent] = field(default_factory=list)
    sections: list[ParsedSection] = field(default_factory=list)

    def get_summary(self) -> str:
        """Get a human-readable summary of the dashboard."""
        lines = []

        if self.title:
            lines.append(f"Dashboard: {self.title}")
        else:
            lines.append(f"Dashboard: {self.file_path.stem}")

        lines.append("")

        if self.queries:
            lines.append("Queries:")
            for q in self.queries:
                lines.append(f"  - {q.name}")

        if self.components:
            lines.append("")
            lines.append("Components:")
            for c in self.components:
                data_ref = c.props.get("data", "?")
                lines.append(f"  - {c.component_type} (data: {data_ref})")

        if self.sections:
            lines.append("")
            lines.append("Sections:")
            for s in self.sections:
                indent = "  " * s.level
                lines.append(f"{indent}- {s.title}")

        return "\n".join(lines)


class DashboardParser:
    """Parse Evidence markdown files."""

    # Regex patterns
    SQL_BLOCK_PATTERN = re.compile(
        r"```sql\s+(\w+)\s*\n(.*?)```", re.DOTALL | re.MULTILINE
    )
    COMPONENT_PATTERN = re.compile(
        r"<(\w+)\s*\n?(.*?)/?>", re.DOTALL | re.MULTILINE
    )
    HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    PROP_PATTERN = re.compile(r'(\w+)=(?:"([^"]*)"|\{([^}]*)\})')

    def __init__(self):
        self.config = get_config()

    def parse_file(self, file_path: Path | str) -> ParsedDashboard:
        """
        Parse a dashboard file.

        Args:
            file_path: Path to the .md file.

        Returns:
            ParsedDashboard with extracted structure.
        """
        file_path = Path(file_path)
        content = file_path.read_text()

        return self.parse_content(content, file_path)

    def parse_content(
        self, content: str, file_path: Path | None = None
    ) -> ParsedDashboard:
        """
        Parse dashboard content.

        Args:
            content: Markdown content.
            file_path: Optional file path for reference.

        Returns:
            ParsedDashboard with extracted structure.
        """
        dashboard = ParsedDashboard(
            file_path=file_path or Path("unknown.md"),
            title=None,
            raw_content=content,
        )

        # Parse title (first h1)
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if title_match:
            dashboard.title = title_match.group(1).strip()

        # Parse SQL queries
        dashboard.queries = self._parse_queries(content)

        # Parse components
        dashboard.components = self._parse_components(content)

        # Parse sections
        dashboard.sections = self._parse_sections(content)

        return dashboard

    def _parse_queries(self, content: str) -> list[ParsedQuery]:
        """Extract SQL queries from content."""
        queries = []

        for match in self.SQL_BLOCK_PATTERN.finditer(content):
            name = match.group(1)
            sql = match.group(2).strip()

            # Calculate line numbers
            start_pos = match.start()
            end_pos = match.end()
            start_line = content[:start_pos].count("\n") + 1
            end_line = content[:end_pos].count("\n") + 1

            queries.append(
                ParsedQuery(
                    name=name, sql=sql, start_line=start_line, end_line=end_line
                )
            )

        return queries

    def _parse_components(self, content: str) -> list[ParsedComponent]:
        """Extract components from content."""
        components = []

        # Match component tags
        for match in self.COMPONENT_PATTERN.finditer(content):
            component_type = match.group(1)
            props_str = match.group(2) or ""

            # Skip SQL code blocks (they also match the pattern)
            if component_type.lower() == "sql":
                continue

            # Parse props
            props = {}
            for prop_match in self.PROP_PATTERN.finditer(props_str):
                prop_name = prop_match.group(1)
                prop_value = prop_match.group(2) or prop_match.group(3)
                props[prop_name] = prop_value

            # Calculate line numbers
            start_pos = match.start()
            end_pos = match.end()
            start_line = content[:start_pos].count("\n") + 1
            end_line = content[:end_pos].count("\n") + 1

            components.append(
                ParsedComponent(
                    component_type=component_type,
                    raw_text=match.group(0),
                    props=props,
                    start_line=start_line,
                    end_line=end_line,
                )
            )

        return components

    def _parse_sections(self, content: str) -> list[ParsedSection]:
        """Extract section headings from content."""
        sections = []

        for match in self.HEADING_PATTERN.finditer(content):
            hashes = match.group(1)
            title = match.group(2).strip()
            level = len(hashes)

            line_number = content[: match.start()].count("\n") + 1

            sections.append(
                ParsedSection(title=title, level=level, line_number=line_number)
            )

        return sections

    def list_dashboards(self) -> list[Path]:
        """List all dashboard files in the pages directory."""
        pages_dir = self.config.pages_dir
        return sorted(pages_dir.glob("*.md"))

    def get_dashboard_summaries(self) -> list[dict[str, Any]]:
        """Get summaries of all dashboards."""
        summaries = []

        for file_path in self.list_dashboards():
            try:
                parsed = self.parse_file(file_path)
                summaries.append(
                    {
                        "file": file_path.name,
                        "title": parsed.title or file_path.stem,
                        "queries": len(parsed.queries),
                        "components": len(parsed.components),
                    }
                )
            except Exception as e:
                summaries.append(
                    {
                        "file": file_path.name,
                        "title": file_path.stem,
                        "error": str(e),
                    }
                )

        return summaries


def parse_dashboard(file_path: Path | str) -> ParsedDashboard:
    """Convenience function to parse a dashboard."""
    parser = DashboardParser()
    return parser.parse_file(file_path)


def list_dashboards() -> list[Path]:
    """Convenience function to list all dashboards."""
    parser = DashboardParser()
    return parser.list_dashboards()
