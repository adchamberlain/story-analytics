"""
Theme storage: save and load chart themes as JSON files.
Follows the same pattern as chart_storage.py.
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
class SavedTheme:
    """A persisted chart theme."""
    id: str
    name: str
    description: str
    theme_data: dict        # Full ChartTheme object (palette, font, plot, pie, card, accent)
    created_at: str
    updated_at: str
    is_builtin: bool = False  # True for built-in themes that cannot be deleted


def save_theme(
    name: str,
    description: str,
    theme_data: dict,
    theme_id: str | None = None,
) -> SavedTheme:
    """Save a theme to disk. If theme_id is provided, use it (for imports)."""
    tid = theme_id or uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    theme = SavedTheme(
        id=tid,
        name=name,
        description=description,
        theme_data=theme_data,
        created_at=now,
        updated_at=now,
    )

    _storage.write_text(f"themes/{tid}.json", json.dumps(asdict(theme), indent=2))
    return theme


def _safe_load_theme(data: dict) -> SavedTheme:
    """Load a SavedTheme from dict, ignoring unknown keys."""
    known = {f.name for f in dc_fields(SavedTheme)}
    return SavedTheme(**{k: v for k, v in data.items() if k in known})


def _validate_id(theme_id: str) -> bool:
    return bool(_SAFE_ID_RE.match(theme_id))


def load_theme(theme_id: str) -> SavedTheme | None:
    """Load a theme from disk."""
    if not _validate_id(theme_id):
        return None
    key = f"themes/{theme_id}.json"
    if not _storage.exists(key):
        return None
    try:
        data = json.loads(_storage.read_text(key))
        return _safe_load_theme(data)
    except Exception:
        logger.warning("Failed to load theme %s", theme_id)
        return None


def list_themes() -> list[SavedTheme]:
    """List all saved themes, newest first."""
    themes = []
    for key in _storage.list("themes/"):
        if not key.endswith(".json"):
            continue
        try:
            data = json.loads(_storage.read_text(key))
            themes.append(_safe_load_theme(data))
        except Exception:
            logger.warning("Skipping corrupted theme file: %s", key)
    themes.sort(key=lambda t: t.updated_at, reverse=True)
    return themes


def update_theme(theme_id: str, **fields) -> SavedTheme | None:
    """Update a theme on disk."""
    if not _validate_id(theme_id):
        return None
    key = f"themes/{theme_id}.json"
    if not _storage.exists(key):
        return None

    try:
        data = json.loads(_storage.read_text(key))
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "description", "theme_data"}
    for key_name, value in fields.items():
        if key_name in _UPDATABLE:
            data[key_name] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _storage.write_text(key, json.dumps(data, indent=2))
    try:
        return _safe_load_theme(data)
    except Exception:
        return None


def delete_theme(theme_id: str) -> bool:
    """Delete a theme."""
    if not _validate_id(theme_id):
        return False
    key = f"themes/{theme_id}.json"
    if _storage.exists(key):
        _storage.delete(key)
        return True
    return False
