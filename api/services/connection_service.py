"""
Connection service: save, load, and manage database connection metadata.
Local-first, Git-friendly persistence via JSON files.

Credentials are NOT persisted — they're provided at sync time or loaded from .env.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, fields as dc_fields

from api.services.storage import get_storage

logger = logging.getLogger(__name__)

_storage = get_storage()

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")


def _validate_id(connection_id: str) -> bool:
    """Return True if connection_id is a safe hex string (no path traversal)."""
    return bool(_SAFE_ID_RE.match(connection_id))


def get_snowflake_pat() -> str | None:
    """Get the Snowflake Programmatic Access Token from environment."""
    return os.environ.get("SNOWFLAKE_PAT")


@dataclass
class ConnectionInfo:
    """A persisted database connection (no credentials)."""
    connection_id: str
    name: str
    db_type: str   # "snowflake", extensible later
    config: dict   # account, warehouse, database, schema — no secrets
    created_at: str


def save_connection(
    name: str,
    db_type: str,
    config: dict,
) -> ConnectionInfo:
    """Save connection metadata to disk."""
    connection_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    conn = ConnectionInfo(
        connection_id=connection_id,
        name=name,
        db_type=db_type,
        config=config,
        created_at=now,
    )

    _storage.write_text(f"connections/{connection_id}.json", json.dumps(asdict(conn), indent=2))
    return conn


def load_connection(connection_id: str) -> ConnectionInfo | None:
    """Load a connection from disk."""
    if not _validate_id(connection_id):
        return None
    key = f"connections/{connection_id}.json"
    if not _storage.exists(key):
        return None

    data = json.loads(_storage.read_text(key))
    known = {f.name for f in dc_fields(ConnectionInfo)}
    return ConnectionInfo(**{k: v for k, v in data.items() if k in known})


def list_connections() -> list[ConnectionInfo]:
    """List all saved connections."""
    connections = []
    known = {f.name for f in dc_fields(ConnectionInfo)}
    for key in _storage.list("connections/"):
        if not key.endswith(".json"):
            continue
        try:
            data = json.loads(_storage.read_text(key))
            connections.append(ConnectionInfo(**{k: v for k, v in data.items() if k in known}))
        except Exception:
            logger.warning("Skipping corrupted connection file: %s", key)
            continue

    return connections


def delete_connection(connection_id: str) -> bool:
    """Delete a connection."""
    if not _validate_id(connection_id):
        return False
    key = f"connections/{connection_id}.json"
    if _storage.exists(key):
        _storage.delete(key)
        return True
    return False
