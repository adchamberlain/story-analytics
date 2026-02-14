"""
Connection service: save, load, and manage database connection metadata.
Local-first, Git-friendly persistence via JSON files.

Credentials are NOT persisted — they're provided at sync time or loaded from .env.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict


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
    path.write_text(json.dumps(asdict(conn), indent=2))
    return conn


def load_connection(connection_id: str) -> ConnectionInfo | None:
    """Load a connection from disk."""
    path = CONNECTIONS_DIR / f"{connection_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    return ConnectionInfo(**data)


def list_connections() -> list[ConnectionInfo]:
    """List all saved connections."""
    if not CONNECTIONS_DIR.exists():
        return []

    connections = []
    for path in sorted(CONNECTIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        data = json.loads(path.read_text())
        connections.append(ConnectionInfo(**data))

    return connections


def delete_connection(connection_id: str) -> bool:
    """Delete a connection."""
    path = CONNECTIONS_DIR / f"{connection_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False
