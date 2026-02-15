"""
Dashboard storage: save and load dashboard configurations as JSON files.
Mirrors chart_storage.py — local-first, Git-friendly persistence.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict


DASHBOARDS_DIR = Path(__file__).parent.parent.parent / "data" / "dashboards"


@dataclass
class DashboardChartRef:
    """A reference to a chart within a dashboard."""
    chart_id: str
    width: str = "half"  # "full" or "half"


@dataclass
class SavedDashboard:
    """A persisted dashboard configuration."""
    id: str
    title: str
    description: str | None
    charts: list[dict]  # list of DashboardChartRef as dicts
    created_at: str
    updated_at: str
    filters: list[dict] | None = None  # list of FilterSpec as dicts


def save_dashboard(
    title: str,
    description: str | None = None,
    charts: list[dict] | None = None,
    filters: list[dict] | None = None,
) -> SavedDashboard:
    """Save a new dashboard to disk."""
    DASHBOARDS_DIR.mkdir(parents=True, exist_ok=True)

    dashboard_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    dashboard = SavedDashboard(
        id=dashboard_id,
        title=title,
        description=description,
        charts=charts or [],
        created_at=now,
        updated_at=now,
        filters=filters,
    )

    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    path.write_text(json.dumps(asdict(dashboard), indent=2))
    return dashboard


def load_dashboard(dashboard_id: str) -> SavedDashboard | None:
    """Load a dashboard from disk."""
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    return SavedDashboard(**data)


def list_dashboards() -> list[SavedDashboard]:
    """List all saved dashboards, newest first."""
    if not DASHBOARDS_DIR.exists():
        return []

    dashboards = []
    for path in sorted(DASHBOARDS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        data = json.loads(path.read_text())
        dashboards.append(SavedDashboard(**data))

    return dashboards


def update_dashboard(dashboard_id: str, **fields) -> SavedDashboard | None:
    """Update a dashboard on disk. Merges provided fields."""
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    now = datetime.now(timezone.utc).isoformat()

    for key, value in fields.items():
        if value is not None:
            data[key] = value

    data["updated_at"] = now
    path.write_text(json.dumps(data, indent=2))
    return SavedDashboard(**data)


def delete_dashboard(dashboard_id: str) -> bool:
    """Delete a dashboard."""
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
