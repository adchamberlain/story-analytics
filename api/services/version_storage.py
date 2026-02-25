"""
Version storage: save and restore chart edit history as JSON snapshots.
Each version is a complete SavedChart JSON plus _version_meta.
Storage: data/versions/{chart_id}/{version_number}.json
Auto-prune: keep last MAX_VERSIONS per chart.
"""

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

VERSIONS_DIR = Path(__file__).parent.parent.parent / "data" / "versions"

MAX_VERSIONS = 50


def _versions_dir(chart_id: str) -> Path:
    """Return the versions directory for a given chart."""
    return VERSIONS_DIR / chart_id


def _version_path(chart_id: str, version: int) -> Path:
    """Return the file path for a specific version."""
    return _versions_dir(chart_id) / f"{version}.json"


def _atomic_write(path: Path, content: str) -> None:
    """Write content to a file atomically via temp file + rename."""
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    fd_closed = False
    try:
        os.write(fd, content.encode())
        os.close(fd)
        fd_closed = True
        os.replace(tmp_name, str(path))
    except BaseException:
        if not fd_closed:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _next_version_number(chart_id: str) -> int:
    """Determine the next version number for a chart (1-based)."""
    chart_dir = _versions_dir(chart_id)
    if not chart_dir.exists():
        return 1
    existing = sorted(
        int(p.stem) for p in chart_dir.glob("*.json") if p.stem.isdigit()
    )
    if not existing:
        return 1
    return existing[-1] + 1


def _prune_versions(chart_id: str) -> None:
    """Keep only the last MAX_VERSIONS versions, deleting oldest."""
    chart_dir = _versions_dir(chart_id)
    if not chart_dir.exists():
        return
    versions = sorted(
        int(p.stem) for p in chart_dir.glob("*.json") if p.stem.isdigit()
    )
    if len(versions) <= MAX_VERSIONS:
        return
    to_delete = versions[: len(versions) - MAX_VERSIONS]
    for v in to_delete:
        path = chart_dir / f"{v}.json"
        try:
            path.unlink()
        except OSError:
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
    chart_dir = _versions_dir(chart_id)
    chart_dir.mkdir(parents=True, exist_ok=True)

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

    path = _version_path(chart_id, version_number)
    _atomic_write(path, json.dumps(snapshot, indent=2))

    # Prune old versions
    _prune_versions(chart_id)

    return version_meta


def list_versions(chart_id: str) -> list[dict]:
    """
    List all versions for a chart, newest first.

    Returns:
        List of version metadata dicts (version, created_at, trigger, label).
    """
    chart_dir = _versions_dir(chart_id)
    if not chart_dir.exists():
        return []

    versions = []
    for path in chart_dir.glob("*.json"):
        if not path.stem.isdigit():
            continue
        try:
            data = json.loads(path.read_text())
            meta = data.get("_version_meta", {})
            versions.append({
                "version": meta.get("version", int(path.stem)),
                "created_at": meta.get("created_at", ""),
                "trigger": meta.get("trigger", "unknown"),
                "label": meta.get("label"),
            })
        except (json.JSONDecodeError, OSError):
            logger.warning("Skipping corrupted version file: %s", path)
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
    path = _version_path(chart_id, version)
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to read version %d for chart %s", version, chart_id)
        return None


def delete_version(chart_id: str, version: int) -> bool:
    """
    Delete a specific version.

    Returns:
        True if deleted, False if not found.
    """
    path = _version_path(chart_id, version)
    if not path.exists():
        return False

    try:
        path.unlink()
        return True
    except OSError:
        logger.warning("Failed to delete version %d for chart %s", version, chart_id)
        return False
