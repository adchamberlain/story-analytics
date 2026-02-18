"""
Dashboard storage: save and load dashboard configurations as JSON files.
Mirrors chart_storage.py — local-first, Git-friendly persistence.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict, fields as dc_fields

logger = logging.getLogger(__name__)

DASHBOARDS_DIR = Path(__file__).parent.parent.parent / "data" / "dashboards"

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")


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
    _atomic_write(path, json.dumps(asdict(dashboard), indent=2))
    return dashboard


def _atomic_write(path: Path, content: str) -> None:
    """Write content to a file atomically via temp file + rename."""
    tmp_path = path.with_suffix(".json.tmp")
    tmp_path.write_text(content)
    os.replace(str(tmp_path), str(path))


def _safe_load_dashboard(data: dict) -> SavedDashboard:
    """Load a SavedDashboard from dict, ignoring unknown keys from newer versions."""
    known = {f.name for f in dc_fields(SavedDashboard)}
    return SavedDashboard(**{k: v for k, v in data.items() if k in known})


def _validate_id(dashboard_id: str) -> bool:
    """Return True if dashboard_id is a safe hex string (no path traversal)."""
    return bool(_SAFE_ID_RE.match(dashboard_id))


def load_dashboard(dashboard_id: str) -> SavedDashboard | None:
    """Load a dashboard from disk."""
    if not _validate_id(dashboard_id):
        return None
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    return _safe_load_dashboard(data)


def list_dashboards() -> list[SavedDashboard]:
    """List all saved dashboards, newest first."""
    if not DASHBOARDS_DIR.exists():
        return []

    dashboards = []
    for path in sorted(DASHBOARDS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            dashboards.append(_safe_load_dashboard(data))
        except Exception:
            logger.warning("Skipping corrupted dashboard file: %s", path.name)
            continue

    return dashboards


def update_dashboard(dashboard_id: str, **fields) -> SavedDashboard | None:
    """Update a dashboard on disk. Merges provided fields."""
    if not _validate_id(dashboard_id):
        return None
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    now = datetime.now(timezone.utc).isoformat()

    # Only allow updating presentation fields — protect id and timestamps
    _UPDATABLE = {"title", "description", "charts", "filters"}
    for key, value in fields.items():
        if key in _UPDATABLE:
            data[key] = value

    data["updated_at"] = now
    _atomic_write(path, json.dumps(data, indent=2))
    return _safe_load_dashboard(data)


def delete_dashboard(dashboard_id: str) -> bool:
    """Delete a dashboard."""
    if not _validate_id(dashboard_id):
        return False
    path = DASHBOARDS_DIR / f"{dashboard_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
