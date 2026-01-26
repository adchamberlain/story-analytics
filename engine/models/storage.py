"""
Chart and Dashboard storage layer.

Provides a simple file-based storage for charts and dashboards.
Can be upgraded to database-backed storage later.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .chart import Chart, Dashboard


class ChartStorage:
    """
    File-based storage for charts.

    Stores charts as JSON files in a designated directory.
    """

    def __init__(self, storage_dir: Path | None = None):
        if storage_dir is None:
            # Default to .story-analytics/charts in project root
            storage_dir = Path(__file__).parent.parent.parent / ".story-analytics" / "charts"

        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_chart_path(self, chart_id: str) -> Path:
        """Get the file path for a chart."""
        return self.storage_dir / f"{chart_id}.json"

    def save(self, chart: Chart) -> None:
        """Save a chart to storage."""
        path = self._get_chart_path(chart.id)
        with open(path, "w") as f:
            json.dump(chart.to_dict(), f, indent=2)

    def get(self, chart_id: str) -> Chart | None:
        """Get a chart by ID."""
        from .chart import Chart

        path = self._get_chart_path(chart_id)
        if not path.exists():
            return None

        with open(path) as f:
            data = json.load(f)
        return Chart.from_dict(data)

    def delete(self, chart_id: str) -> bool:
        """Delete a chart. Returns True if deleted, False if not found."""
        path = self._get_chart_path(chart_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_all(self) -> list[Chart]:
        """List all stored charts."""
        from .chart import Chart

        charts = []
        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path) as f:
                    data = json.load(f)
                charts.append(Chart.from_dict(data))
            except (json.JSONDecodeError, KeyError) as e:
                print(f"[ChartStorage] Error loading {path}: {e}")
        return charts

    def search(
        self,
        query: str | None = None,
        chart_type: str | None = None,
        limit: int = 50
    ) -> list[Chart]:
        """
        Search charts by query text or type.

        Args:
            query: Search in title and description
            chart_type: Filter by chart type
            limit: Maximum results to return

        Returns:
            List of matching charts
        """
        charts = self.list_all()

        if query:
            query = query.lower()
            charts = [
                c for c in charts
                if query in c.title.lower() or query in c.description.lower()
            ]

        if chart_type:
            from .chart import ChartType
            target_type = ChartType.from_string(chart_type)
            charts = [c for c in charts if c.chart_type == target_type]

        # Sort by updated_at descending (most recently touched first)
        charts.sort(key=lambda c: c.updated_at, reverse=True)

        return charts[:limit]


class DashboardStorage:
    """
    File-based storage for dashboards.

    Stores dashboards as JSON files in a designated directory.
    """

    def __init__(self, storage_dir: Path | None = None):
        if storage_dir is None:
            # Default to .story-analytics/dashboards in project root
            storage_dir = Path(__file__).parent.parent.parent / ".story-analytics" / "dashboards"

        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_dashboard_path(self, dashboard_id: str) -> Path:
        """Get the file path for a dashboard."""
        return self.storage_dir / f"{dashboard_id}.json"

    def save(self, dashboard: Dashboard) -> None:
        """Save a dashboard to storage."""
        path = self._get_dashboard_path(dashboard.id)
        with open(path, "w") as f:
            json.dump(dashboard.to_dict(), f, indent=2)

    def get(self, dashboard_id: str) -> Dashboard | None:
        """Get a dashboard by ID."""
        from .chart import Dashboard

        path = self._get_dashboard_path(dashboard_id)
        if not path.exists():
            return None

        with open(path) as f:
            data = json.load(f)
        return Dashboard.from_dict(data)

    def get_by_slug(self, slug: str) -> Dashboard | None:
        """Get a dashboard by its URL slug. Returns the most recently updated if duplicates exist."""
        matching = [d for d in self.list_all() if d.slug == slug]
        if not matching:
            return None
        # Return most recently updated
        return max(matching, key=lambda d: d.updated_at)

    def delete(self, dashboard_id: str) -> bool:
        """Delete a dashboard. Returns True if deleted, False if not found."""
        path = self._get_dashboard_path(dashboard_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_all(self) -> list[Dashboard]:
        """List all stored dashboards."""
        from .chart import Dashboard

        dashboards = []
        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path) as f:
                    data = json.load(f)
                dashboards.append(Dashboard.from_dict(data))
            except (json.JSONDecodeError, KeyError) as e:
                print(f"[DashboardStorage] Error loading {path}: {e}")
        return dashboards


# Singleton instances for convenient access
_chart_storage: ChartStorage | None = None
_dashboard_storage: DashboardStorage | None = None


def get_chart_storage() -> ChartStorage:
    """Get the global chart storage instance."""
    global _chart_storage
    if _chart_storage is None:
        _chart_storage = ChartStorage()
    return _chart_storage


def get_dashboard_storage() -> DashboardStorage:
    """Get the global dashboard storage instance."""
    global _dashboard_storage
    if _dashboard_storage is None:
        _dashboard_storage = DashboardStorage()
    return _dashboard_storage
