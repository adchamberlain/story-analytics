"""
Dashboard storage: save and load dashboard configurations as JSON files.
Mirrors chart_storage.py — local-first, Git-friendly persistence.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, fields as dc_fields

from api.services.storage import get_storage

logger = logging.getLogger(__name__)

_storage = get_storage()

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
    status: str = "draft"  # "draft" | "published"


def save_dashboard(
    title: str,
    description: str | None = None,
    charts: list[dict] | None = None,
    filters: list[dict] | None = None,
) -> SavedDashboard:
    """Save a new dashboard to disk."""
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

    _storage.write_text(f"dashboards/{dashboard_id}.json", json.dumps(asdict(dashboard), indent=2))
    return dashboard


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
    key = f"dashboards/{dashboard_id}.json"
    if not _storage.exists(key):
        return None

    try:
        data = json.loads(_storage.read_text(key))
        return _safe_load_dashboard(data)
    except Exception:
        logger.warning("Failed to load dashboard %s (corrupted or schema mismatch?)", dashboard_id)
        return None


def list_dashboards() -> list[SavedDashboard]:
    """List all saved dashboards, newest first."""
    dashboards = []
    for key in _storage.list("dashboards/"):
        if not key.endswith(".json"):
            continue
        try:
            data = json.loads(_storage.read_text(key))
            dashboards.append(_safe_load_dashboard(data))
        except Exception:
            logger.warning("Skipping corrupted dashboard file: %s", key)
            continue

    dashboards.sort(key=lambda d: d.updated_at, reverse=True)
    return dashboards


def update_dashboard(dashboard_id: str, **fields) -> SavedDashboard | None:
    """Update a dashboard on disk. Merges provided fields."""
    if not _validate_id(dashboard_id):
        return None
    key = f"dashboards/{dashboard_id}.json"
    if not _storage.exists(key):
        return None

    try:
        data = json.loads(_storage.read_text(key))
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to read dashboard %s for update (corrupted?)", dashboard_id)
        return None
    now = datetime.now(timezone.utc).isoformat()

    # Only allow updating presentation fields — protect id and timestamps
    _UPDATABLE = {"title", "description", "charts", "filters", "status"}
    for key_name, value in fields.items():
        if key_name in _UPDATABLE:
            data[key_name] = value

    data["updated_at"] = now
    _storage.write_text(key, json.dumps(data, indent=2))
    return _safe_load_dashboard(data)


def delete_dashboard(dashboard_id: str) -> bool:
    """Delete a dashboard."""
    if not _validate_id(dashboard_id):
        return False
    key = f"dashboards/{dashboard_id}.json"
    if _storage.exists(key):
        _storage.delete(key)
        return True
    return False
