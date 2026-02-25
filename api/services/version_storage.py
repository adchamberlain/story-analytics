"""
Version storage: save and restore chart edit history as JSON snapshots.
Each version is a complete SavedChart JSON plus _version_meta.
Storage: versions/{chart_id}/{version_number}.json
Auto-prune: keep last MAX_VERSIONS per chart.
"""

import json
import logging
from datetime import datetime, timezone

from api.services.storage import get_storage

logger = logging.getLogger(__name__)

_storage = get_storage()

MAX_VERSIONS = 50


def _version_key(chart_id: str, version: int) -> str:
    """Return the storage key for a specific version."""
    return f"versions/{chart_id}/{version}.json"


def _list_version_numbers(chart_id: str) -> list[int]:
    """List all version numbers for a chart, sorted ascending."""
    prefix = f"versions/{chart_id}/"
    keys = _storage.list(prefix)
    versions = []
    for key in keys:
        # key looks like "versions/{chart_id}/{number}.json"
        filename = key.rsplit("/", 1)[-1]
        stem = filename.removesuffix(".json")
        if stem.isdigit():
            versions.append(int(stem))
    return sorted(versions)


def _next_version_number(chart_id: str) -> int:
    """Determine the next version number for a chart (1-based)."""
    existing = _list_version_numbers(chart_id)
    if not existing:
        return 1
    return existing[-1] + 1


def _prune_versions(chart_id: str) -> None:
    """Keep only the last MAX_VERSIONS versions, deleting oldest."""
    versions = _list_version_numbers(chart_id)
    if len(versions) <= MAX_VERSIONS:
        return
    to_delete = versions[: len(versions) - MAX_VERSIONS]
    for v in to_delete:
        key = _version_key(chart_id, v)
        try:
            _storage.delete(key)
        except (OSError, FileNotFoundError):
            logger.warning("Failed to prune version %d for chart %s", v, chart_id)


def create_version(
    chart_id: str,
    chart_data: dict,
    trigger: str = "manual",
    label: str | None = None,
) -> dict:
    """
    Create a version snapshot for a chart.

    Args:
        chart_id: The chart's ID.
        chart_data: Complete chart JSON data (as dict).
        trigger: "auto", "manual", or "publish".
        label: Optional human-readable label.

    Returns:
        The version metadata dict.
    """
    version_number = _next_version_number(chart_id)
    now = datetime.now(timezone.utc).isoformat()

    version_meta = {
        "version": version_number,
        "created_at": now,
        "trigger": trigger,
        "label": label,
    }

    # Build the full snapshot: chart data + version metadata
    snapshot = {**chart_data, "_version_meta": version_meta}

    key = _version_key(chart_id, version_number)
    _storage.write_text(key, json.dumps(snapshot, indent=2))

    # Prune old versions
    _prune_versions(chart_id)

    return version_meta


def list_versions(chart_id: str) -> list[dict]:
    """
    List all versions for a chart, newest first.

    Returns:
        List of version metadata dicts (version, created_at, trigger, label).
    """
    versions = []
    prefix = f"versions/{chart_id}/"
    for key in _storage.list(prefix):
        # Extract version number from key
        filename = key.rsplit("/", 1)[-1]
        stem = filename.removesuffix(".json")
        if not stem.isdigit():
            continue
        try:
            data = json.loads(_storage.read_text(key))
            meta = data.get("_version_meta", {})
            versions.append({
                "version": meta.get("version", int(stem)),
                "created_at": meta.get("created_at", ""),
                "trigger": meta.get("trigger", "unknown"),
                "label": meta.get("label"),
            })
        except (json.JSONDecodeError, OSError):
            logger.warning("Skipping corrupted version file: %s", key)
            continue

    # Sort newest first
    versions.sort(key=lambda v: v["version"], reverse=True)
    return versions


def get_version(chart_id: str, version: int) -> dict | None:
    """
    Get the full content of a specific version.

    Returns:
        The complete snapshot dict (chart data + _version_meta), or None if not found.
    """
    key = _version_key(chart_id, version)
    if not _storage.exists(key):
        return None

    try:
        return json.loads(_storage.read_text(key))
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to read version %d for chart %s", version, chart_id)
        return None


def delete_version(chart_id: str, version: int) -> bool:
    """
    Delete a specific version.

    Returns:
        True if deleted, False if not found.
    """
    key = _version_key(chart_id, version)
    if not _storage.exists(key):
        return False

    try:
        _storage.delete(key)
        return True
    except (OSError, FileNotFoundError):
        logger.warning("Failed to delete version %d for chart %s", version, chart_id)
        return False
