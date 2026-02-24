"""
Theme storage: save and load chart themes as JSON files.
Follows the same pattern as chart_storage.py.
"""

import json
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict, fields as dc_fields

logger = logging.getLogger(__name__)

THEMES_DIR = Path(__file__).parent.parent.parent / "data" / "themes"

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
    THEMES_DIR.mkdir(parents=True, exist_ok=True)

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

    path = THEMES_DIR / f"{tid}.json"
    _atomic_write(path, json.dumps(asdict(theme), indent=2))
    return theme


def _atomic_write(path: Path, content: str) -> None:
    """Write content atomically via temp file + rename."""
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
    path = THEMES_DIR / f"{theme_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return _safe_load_theme(data)
    except Exception:
        logger.warning("Failed to load theme %s", theme_id)
        return None


def list_themes() -> list[SavedTheme]:
    """List all saved themes, newest first."""
    if not THEMES_DIR.exists():
        return []

    themes = []
    for path in sorted(THEMES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            themes.append(_safe_load_theme(data))
        except Exception:
            logger.warning("Skipping corrupted theme file: %s", path.name)
    return themes


def update_theme(theme_id: str, **fields) -> SavedTheme | None:
    """Update a theme on disk."""
    if not _validate_id(theme_id):
        return None
    path = THEMES_DIR / f"{theme_id}.json"
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "description", "theme_data"}
    for key, value in fields.items():
        if key in _UPDATABLE:
            data[key] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(path, json.dumps(data, indent=2))
    try:
        return _safe_load_theme(data)
    except Exception:
        return None


def delete_theme(theme_id: str) -> bool:
    """Delete a theme."""
    if not _validate_id(theme_id):
        return False
    path = THEMES_DIR / f"{theme_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
