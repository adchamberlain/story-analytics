"""
Dashboard Composer - Assembles charts into dashboards.

This module provides functionality to:
1. Create new dashboards from charts
2. Add/remove charts from existing dashboards
3. Store dashboard metadata

Note: Evidence markdown generation has been removed.
Charts are now rendered directly via the React frontend.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .models import Chart, Dashboard, DashboardLayout, get_chart_storage, get_dashboard_storage

if TYPE_CHECKING:
    from .models import ValidatedChart


class DashboardComposer:
    """
    Composes charts into dashboards.

    Handles dashboard metadata storage. Charts are rendered
    directly by the React frontend via the render API.
    """

    def __init__(self):
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

    def create_single_chart_dashboard(
        self,
        chart: Chart | ValidatedChart,
        title: str | None = None,
    ) -> Dashboard:
        """
        Create a dashboard containing a single chart.

        This is the quick path for "create a chart" requests -
        we create a minimal dashboard wrapper around the chart.

        Args:
            chart: The chart to wrap
            title: Optional title override (defaults to chart title)

        Returns:
            The created Dashboard
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
        return dashboard

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
) -> Dashboard:
    """
    Convenience function to create a single-chart dashboard.

    Args:
        chart: The chart to wrap
        title: Optional title override

    Returns:
        The created Dashboard
    """
    return get_composer().create_single_chart_dashboard(chart, title)
