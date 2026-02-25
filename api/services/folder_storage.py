"""
Folder storage: organize charts into folders.
Same pattern as chart_storage.py — JSON files in data/folders/.
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
class SavedFolder:
    """A persisted folder."""
    id: str
    name: str
    parent_id: str | None
    created_at: str
    updated_at: str


def _validate_id(folder_id: str) -> bool:
    return bool(_SAFE_ID_RE.match(folder_id))


def _safe_load(data: dict) -> SavedFolder:
    known = {f.name for f in dc_fields(SavedFolder)}
    return SavedFolder(**{k: v for k, v in data.items() if k in known})


def save_folder(name: str, parent_id: str | None = None) -> SavedFolder:
    """Create a new folder."""
    folder_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    folder = SavedFolder(
        id=folder_id,
        name=name,
        parent_id=parent_id,
        created_at=now,
        updated_at=now,
    )

    _storage.write_text(f"folders/{folder_id}.json", json.dumps(asdict(folder), indent=2))
    return folder


def load_folder(folder_id: str) -> SavedFolder | None:
    """Load a folder from disk."""
    if not _validate_id(folder_id):
        return None
    key = f"folders/{folder_id}.json"
    if not _storage.exists(key):
        return None
    try:
        data = json.loads(_storage.read_text(key))
        return _safe_load(data)
    except Exception:
        logger.warning("Failed to load folder %s", folder_id)
        return None


def list_folders() -> list[SavedFolder]:
    """List all folders, newest first."""
    folders = []
    for key in _storage.list("folders/"):
        if not key.endswith(".json"):
            continue
        try:
            data = json.loads(_storage.read_text(key))
            folders.append(_safe_load(data))
        except Exception:
            logger.warning("Skipping corrupted folder file: %s", key)
    folders.sort(key=lambda f: f.updated_at, reverse=True)
    return folders


def update_folder(folder_id: str, **fields) -> SavedFolder | None:
    """Update folder fields."""
    if not _validate_id(folder_id):
        return None
    key = f"folders/{folder_id}.json"
    if not _storage.exists(key):
        return None

    try:
        data = json.loads(_storage.read_text(key))
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "parent_id"}
    for key_name, value in fields.items():
        if key_name in _UPDATABLE:
            data[key_name] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _storage.write_text(key, json.dumps(data, indent=2))
    try:
        return _safe_load(data)
    except Exception:
        return None


def delete_folder(folder_id: str) -> bool:
    """Delete a folder."""
    if not _validate_id(folder_id):
        return False
    key = f"folders/{folder_id}.json"
    if _storage.exists(key):
        _storage.delete(key)
        return True
    return False
