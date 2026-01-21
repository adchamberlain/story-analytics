"""
Dashboard Composer - Assembles charts into dashboards.

This module provides functionality to:
1. Create new dashboards from charts
2. Add/remove charts from existing dashboards
3. Generate Evidence markdown from dashboard definitions
4. Write dashboards to the Evidence pages directory
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from .config import get_config
from .models import Chart, Dashboard, DashboardLayout, get_chart_storage, get_dashboard_storage

if TYPE_CHECKING:
    from .models import ValidatedChart


class DashboardComposer:
    """
    Composes charts into dashboards and generates Evidence markdown.

    This is a deterministic process - no LLM needed.
    """

    def __init__(self):
        self.config = get_config()
        self.chart_storage = get_chart_storage()
        self.dashboard_storage = get_dashboard_storage()

    def create_dashboard(
        self,
        title: str,
        description: str | None = None,
        chart_ids: list[str] | None = None,
    ) -> Dashboard:
        """
        Create a new dashboard.

        Args:
            title: Dashboard title
            description: Optional description
            chart_ids: Optional list of chart IDs to include

        Returns:
            The created Dashboard
        """
        slug = self._slugify(title)

        dashboard = Dashboard(
            slug=slug,
            title=title,
            description=description,
            chart_ids=chart_ids or [],
        )

        self.dashboard_storage.save(dashboard)
        return dashboard

    def add_chart_to_dashboard(
        self,
        dashboard_id: str,
        chart_id: str,
        section: str | None = None,
    ) -> Dashboard | None:
        """
        Add a chart to an existing dashboard.

        Args:
            dashboard_id: The dashboard to modify
            chart_id: The chart to add
            section: Optional section name for organization

        Returns:
            The updated Dashboard, or None if not found
        """
        dashboard = self.dashboard_storage.get(dashboard_id)
        if not dashboard:
            return None

        dashboard.add_chart(chart_id, section)
        self.dashboard_storage.save(dashboard)
        return dashboard

    def remove_chart_from_dashboard(
        self,
        dashboard_id: str,
        chart_id: str,
    ) -> Dashboard | None:
        """
        Remove a chart from a dashboard.

        Args:
            dashboard_id: The dashboard to modify
            chart_id: The chart to remove

        Returns:
            The updated Dashboard, or None if not found
        """
        dashboard = self.dashboard_storage.get(dashboard_id)
        if not dashboard:
            return None

        dashboard.remove_chart(chart_id)
        self.dashboard_storage.save(dashboard)
        return dashboard

    def reorder_charts(
        self,
        dashboard_id: str,
        chart_ids: list[str],
    ) -> Dashboard | None:
        """
        Reorder charts in a dashboard.

        Args:
            dashboard_id: The dashboard to modify
            chart_ids: New order of chart IDs

        Returns:
            The updated Dashboard, or None if not found
        """
        dashboard = self.dashboard_storage.get(dashboard_id)
        if not dashboard:
            return None

        dashboard.reorder_charts(chart_ids)
        self.dashboard_storage.save(dashboard)
        return dashboard

    def generate_markdown(self, dashboard: Dashboard) -> str:
        """
        Generate Evidence markdown for a dashboard.

        Args:
            dashboard: The dashboard to render

        Returns:
            Complete Evidence markdown string
        """
        # Load all charts
        charts = []
        for chart_id in dashboard.chart_ids:
            chart = self.chart_storage.get(chart_id)
            if chart:
                charts.append(chart)

        return dashboard.to_evidence_markdown(charts)

    def write_dashboard(self, dashboard: Dashboard) -> Path:
        """
        Write a dashboard to the Evidence pages directory.

        Args:
            dashboard: The dashboard to write

        Returns:
            Path to the created file
        """
        markdown = self.generate_markdown(dashboard)

        # Evidence expects: pages_dir/slug/+page.md
        dashboard_dir = self.config.pages_dir / dashboard.slug
        dashboard_dir.mkdir(parents=True, exist_ok=True)
        file_path = dashboard_dir / "+page.md"

        # Create backup if file exists
        if file_path.exists():
            backup_path = file_path.with_suffix(".md.bak")
            backup_path.write_text(file_path.read_text())

        file_path.write_text(markdown)
        return file_path

    def create_single_chart_dashboard(
        self,
        chart: Chart | ValidatedChart,
        title: str | None = None,
    ) -> tuple[Dashboard, Path]:
        """
        Create a dashboard containing a single chart.

        This is the quick path for "create a chart" requests -
        we create a minimal dashboard wrapper around the chart.

        Args:
            chart: The chart to wrap
            title: Optional title override (defaults to chart title)

        Returns:
            Tuple of (Dashboard, file_path)
        """
        # Handle ValidatedChart by converting to Chart first
        if hasattr(chart, 'spec'):
            # This is a ValidatedChart
            stored_chart = Chart.from_validated(chart)
            self.chart_storage.save(stored_chart)
            chart = stored_chart
        else:
            # Already a Chart, ensure it's saved
            self.chart_storage.save(chart)

        dashboard_title = title or chart.title
        slug = self._slugify(dashboard_title)

        dashboard = Dashboard(
            slug=slug,
            title=dashboard_title,
            description=chart.description,
            chart_ids=[chart.id],
        )

        self.dashboard_storage.save(dashboard)
        file_path = self.write_dashboard(dashboard)

        return dashboard, file_path

    def write_chart_preview(self, chart: Chart | ValidatedChart) -> Path:
        """
        Write a chart to a preview location for viewing.

        This creates a minimal Evidence page just for this chart,
        without creating a full dashboard entry.

        Args:
            chart: The chart to preview

        Returns:
            Path to the preview file
        """
        # Generate markdown for just this chart
        if hasattr(chart, 'to_evidence_markdown'):
            chart_markdown = chart.to_evidence_markdown()
        else:
            # ValidatedChart
            chart_markdown = chart.to_evidence_markdown()

        # Get title
        if hasattr(chart, 'title'):
            title = chart.title
        else:
            title = chart.spec.title

        # Create the preview page
        lines = [
            f"# {title}",
            "",
            chart_markdown,
        ]
        markdown = "\n".join(lines)

        # Write to preview location
        slug = self._slugify(title)
        preview_dir = self.config.pages_dir / "_preview" / slug
        preview_dir.mkdir(parents=True, exist_ok=True)
        file_path = preview_dir / "+page.md"
        file_path.write_text(markdown)

        return file_path

    def _slugify(self, text: str) -> str:
        """Convert text to a URL-friendly slug."""
        text = text.lower()
        text = re.sub(r"[^a-z0-9]+", "-", text)
        text = text.strip("-")
        return text


# Singleton instance
_composer: DashboardComposer | None = None


def get_composer() -> DashboardComposer:
    """Get the global dashboard composer instance."""
    global _composer
    if _composer is None:
        _composer = DashboardComposer()
    return _composer


def create_chart_dashboard(
    chart: Chart | ValidatedChart,
    title: str | None = None,
) -> tuple[Dashboard, Path]:
    """
    Convenience function to create a single-chart dashboard.

    Args:
        chart: The chart to wrap
        title: Optional title override

    Returns:
        Tuple of (Dashboard, file_path)
    """
    return get_composer().create_single_chart_dashboard(chart, title)
