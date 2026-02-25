"""
Template storage: save and load chart templates as JSON files.
Follows the same pattern as chart_storage.py and theme_storage.py.
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

    _storage.write_text(f"templates/{tid}.json", json.dumps(asdict(template), indent=2))
    return template


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
    key = f"templates/{template_id}.json"
    if not _storage.exists(key):
        return None
    try:
        data = json.loads(_storage.read_text(key))
        return _safe_load_template(data)
    except Exception:
        logger.warning("Failed to load template %s", template_id)
        return None


def list_templates() -> list[SavedTemplate]:
    """List all saved templates, newest first."""
    templates = []
    for key in _storage.list("templates/"):
        if not key.endswith(".json"):
            continue
        try:
            data = json.loads(_storage.read_text(key))
            templates.append(_safe_load_template(data))
        except Exception:
            logger.warning("Skipping corrupted template file: %s", key)
    templates.sort(key=lambda t: t.updated_at, reverse=True)
    return templates


def update_template(template_id: str, **fields) -> SavedTemplate | None:
    """Update a template on disk."""
    if not _validate_id(template_id):
        return None
    key = f"templates/{template_id}.json"
    if not _storage.exists(key):
        return None

    try:
        data = json.loads(_storage.read_text(key))
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "description", "chart_type", "config"}
    for key_name, value in fields.items():
        if key_name in _UPDATABLE:
            data[key_name] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _storage.write_text(key, json.dumps(data, indent=2))
    try:
        return _safe_load_template(data)
    except Exception:
        return None


def delete_template(template_id: str) -> bool:
    """Delete a template."""
    if not _validate_id(template_id):
        return False
    key = f"templates/{template_id}.json"
    if _storage.exists(key):
        _storage.delete(key)
        return True
    return False
