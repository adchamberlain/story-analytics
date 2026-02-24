"""
Folder storage: organize charts into folders.
Same pattern as chart_storage.py — JSON files in data/folders/.
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

FOLDERS_DIR = Path(__file__).parent.parent.parent / "data" / "folders"

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")


@dataclass
class SavedFolder:
    """A persisted folder."""
    id: str
    name: str
    parent_id: str | None
    created_at: str
    updated_at: str


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


def _validate_id(folder_id: str) -> bool:
    return bool(_SAFE_ID_RE.match(folder_id))


def _safe_load(data: dict) -> SavedFolder:
    known = {f.name for f in dc_fields(SavedFolder)}
    return SavedFolder(**{k: v for k, v in data.items() if k in known})


def save_folder(name: str, parent_id: str | None = None) -> SavedFolder:
    """Create a new folder."""
    FOLDERS_DIR.mkdir(parents=True, exist_ok=True)

    folder_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    folder = SavedFolder(
        id=folder_id,
        name=name,
        parent_id=parent_id,
        created_at=now,
        updated_at=now,
    )

    path = FOLDERS_DIR / f"{folder_id}.json"
    _atomic_write(path, json.dumps(asdict(folder), indent=2))
    return folder


def load_folder(folder_id: str) -> SavedFolder | None:
    """Load a folder from disk."""
    if not _validate_id(folder_id):
        return None
    path = FOLDERS_DIR / f"{folder_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return _safe_load(data)
    except Exception:
        logger.warning("Failed to load folder %s", folder_id)
        return None


def list_folders() -> list[SavedFolder]:
    """List all folders, newest first."""
    if not FOLDERS_DIR.exists():
        return []

    folders = []
    for path in sorted(FOLDERS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            folders.append(_safe_load(data))
        except Exception:
            logger.warning("Skipping corrupted folder file: %s", path.name)
    return folders


def update_folder(folder_id: str, **fields) -> SavedFolder | None:
    """Update folder fields."""
    if not _validate_id(folder_id):
        return None
    path = FOLDERS_DIR / f"{folder_id}.json"
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    _UPDATABLE = {"name", "parent_id"}
    for key, value in fields.items():
        if key in _UPDATABLE:
            data[key] = value

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(path, json.dumps(data, indent=2))
    try:
        return _safe_load(data)
    except Exception:
        return None


def delete_folder(folder_id: str) -> bool:
    """Delete a folder."""
    if not _validate_id(folder_id):
        return False
    path = FOLDERS_DIR / f"{folder_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
