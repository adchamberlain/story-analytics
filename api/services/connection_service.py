"""
Connection service: save, load, and manage database connection metadata.
Local-first, Git-friendly persistence via JSON files.

Credentials are NOT persisted — they're provided at sync time or loaded from .env.
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

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")


def _validate_id(connection_id: str) -> bool:
    """Return True if connection_id is a safe hex string (no path traversal)."""
    return bool(_SAFE_ID_RE.match(connection_id))


CONNECTIONS_DIR = Path(__file__).parent.parent.parent / "data" / "connections"
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
    CONNECTIONS_DIR.mkdir(parents=True, exist_ok=True)

    connection_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    conn = ConnectionInfo(
        connection_id=connection_id,
        name=name,
        db_type=db_type,
        config=config,
        created_at=now,
    )

    path = CONNECTIONS_DIR / f"{connection_id}.json"
    fd, tmp_name = tempfile.mkstemp(dir=CONNECTIONS_DIR, suffix=".tmp")
    try:
        os.write(fd, json.dumps(asdict(conn), indent=2).encode())
        os.close(fd)
        os.replace(tmp_name, str(path))
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return conn


def load_connection(connection_id: str) -> ConnectionInfo | None:
    """Load a connection from disk."""
    if not _validate_id(connection_id):
        return None
    path = CONNECTIONS_DIR / f"{connection_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    known = {f.name for f in dc_fields(ConnectionInfo)}
    return ConnectionInfo(**{k: v for k, v in data.items() if k in known})


def list_connections() -> list[ConnectionInfo]:
    """List all saved connections."""
    if not CONNECTIONS_DIR.exists():
        return []

    connections = []
    known = {f.name for f in dc_fields(ConnectionInfo)}
    for path in sorted(CONNECTIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            connections.append(ConnectionInfo(**{k: v for k, v in data.items() if k in known}))
        except Exception:
            logger.warning("Skipping corrupted connection file: %s", path.name)
            continue

    return connections


def delete_connection(connection_id: str) -> bool:
    """Delete a connection."""
    if not _validate_id(connection_id):
        return False
    path = CONNECTIONS_DIR / f"{connection_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
