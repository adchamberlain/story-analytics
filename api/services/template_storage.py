"""
Template storage: save and load chart templates as JSON files.
Follows the same pattern as chart_storage.py and theme_storage.py.
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

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "data" / "templates"

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")


@dataclass
class SavedTemplate:
    """A persisted chart template (config without data binding)."""
    id: str
    name: str
    description: str
    chart_type: str
    config: dict            # Visual config blob (palette, toggles, annotations, etc.)
    created_at: str
    updated_at: str


def save_template(
    name: str,
    description: str,
    chart_type: str,
    config: dict,
    template_id: str | None = None,
) -> SavedTemplate:
    """Save a template to disk."""
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    tid = template_id or uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    template = SavedTemplate(
        id=tid,
        name=name,
        description=description,
        chart_type=chart_type,
        config=config,
        created_at=now,
        updated_at=now,
    )

    path = TEMPLATES_DIR / f"{tid}.json"
    _atomic_write(path, json.dumps(asdict(template), indent=2))
    return template


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


def _safe_load_template(data: dict) -> SavedTemplate:
    """Load a SavedTemplate from dict, ignoring unknown keys."""
    known = {f.name for f in dc_fields(SavedTemplate)}
    return SavedTemplate(**{k: v for k, v in data.items() if k in known})


def _validate_id(template_id: str) -> bool:
    return bool(_SAFE_ID_RE.match(template_id))


def load_template(template_id: str) -> SavedTemplate | None:
    """Load a template from disk."""
    if not _validate_id(template_id):
        return None
    path = TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return _safe_load_template(data)
    except Exception:
        logger.warning("Failed to load template %s", template_id)
        return None


def list_templates() -> list[SavedTemplate]:
    """List all saved templates, newest first."""
    if not TEMPLATES_DIR.exists():
        return []

    templates = []
    for path in sorted(TEMPLATES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            templates.append(_safe_load_template(data))
        except Exception:
            logger.warning("Skipping corrupted template file: %s", path.name)
    return templates


def update_template(template_id: str, **fields) -> SavedTemplate | None:
    """Update a template on disk."""
    if not _validate_id(template_id):
        return None
    path = TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "description", "chart_type", "config"}
    for key, value in fields.items():
        if key in _UPDATABLE:
            data[key] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(path, json.dumps(data, indent=2))
    try:
        return _safe_load_template(data)
    except Exception:
        return None


def delete_template(template_id: str) -> bool:
    """Delete a template."""
    if not _validate_id(template_id):
        return False
    path = TEMPLATES_DIR / f"{template_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
