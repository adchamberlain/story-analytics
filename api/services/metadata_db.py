"""
SQLite metadata store for users, dashboard ownership, and sharing.

Chart/dashboard JSON files remain on disk (Git-friendly).
SQLite tracks ownership, visibility, and access control metadata.

When AUTH_ENABLED=false (default), all operations use a default user
and all dashboards are effectively public.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "data" / "metadata.db"


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating the DB and tables if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _ensure_tables(conn)
    return conn


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Create tables if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            role TEXT NOT NULL DEFAULT 'editor',
            created_at TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS dashboard_meta (
            dashboard_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'private',
            created_at TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS dashboard_shares (
            id TEXT PRIMARY KEY,
            dashboard_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            access_level TEXT NOT NULL DEFAULT 'view',
            created_at TEXT NOT NULL,
            FOREIGN KEY (dashboard_id) REFERENCES dashboard_meta(dashboard_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(dashboard_id, user_id)
        );
    """)


# ── Default User (for AUTH_ENABLED=false) ────────────────────────────────────

DEFAULT_USER_ID = "default-user"
DEFAULT_USER_EMAIL = "default@local"


def ensure_default_user() -> str:
    """Ensure the default user exists. Returns the user ID."""
    conn = _get_conn()
    try:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (DEFAULT_USER_ID,)).fetchone()
        if not row:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO users (id, email, password_hash, display_name, role, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (DEFAULT_USER_ID, DEFAULT_USER_EMAIL, "", "Default User", "admin", now),
            )
            conn.commit()
        return DEFAULT_USER_ID
    finally:
        conn.close()


# ── User CRUD ────────────────────────────────────────────────────────────────

def create_user(email: str, password_hash: str, display_name: str | None = None) -> dict:
    """Create a new user. Returns user dict."""
    conn = _get_conn()
    try:
        user_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()

        # First user becomes admin
        count = conn.execute("SELECT COUNT(*) FROM users WHERE id != ?", (DEFAULT_USER_ID,)).fetchone()[0]
        role = "admin" if count == 0 else "editor"

        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name, role, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, email, password_hash, display_name or email, role, now),
        )
        conn.commit()
        return {"id": user_id, "email": email, "display_name": display_name or email, "role": role}
    finally:
        conn.close()


def get_user_by_email(email: str) -> dict | None:
    """Lookup user by email."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, email, password_hash, display_name, role FROM users WHERE email = ? AND is_active = 1",
            (email,),
        ).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> dict | None:
    """Lookup user by ID."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, email, display_name, role FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


# ── Dashboard Metadata ───────────────────────────────────────────────────────

def set_dashboard_meta(dashboard_id: str, owner_id: str, visibility: str = "private") -> None:
    """Create or update dashboard metadata.

    Preserves created_at on update (INSERT OR REPLACE would overwrite it).
    """
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO dashboard_meta (dashboard_id, owner_id, visibility, created_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(dashboard_id) DO UPDATE SET owner_id = excluded.owner_id, visibility = excluded.visibility",
            (dashboard_id, owner_id, visibility, now),
        )
        conn.commit()
    finally:
        conn.close()


def get_dashboard_meta(dashboard_id: str) -> dict | None:
    """Get dashboard metadata."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT dashboard_id, owner_id, visibility FROM dashboard_meta WHERE dashboard_id = ?",
            (dashboard_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


_VALID_VISIBILITY = {"private", "team", "public"}


def update_dashboard_visibility(dashboard_id: str, visibility: str) -> None:
    """Update dashboard visibility (private, team, public)."""
    if visibility not in _VALID_VISIBILITY:
        raise ValueError(f"Invalid visibility: {visibility!r}. Must be one of {_VALID_VISIBILITY}")
    conn = _get_conn()
    try:
        conn.execute(
            "UPDATE dashboard_meta SET visibility = ? WHERE dashboard_id = ?",
            (visibility, dashboard_id),
        )
        conn.commit()
    finally:
        conn.close()


def list_accessible_dashboards(user_id: str) -> list[str]:
    """List dashboard IDs accessible to a user (owned, shared, or public)."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT DISTINCT dashboard_id FROM ("
            "  SELECT dashboard_id FROM dashboard_meta WHERE owner_id = ? "
            "  UNION "
            "  SELECT dashboard_id FROM dashboard_shares WHERE user_id = ? "
            "  UNION "
            "  SELECT dashboard_id FROM dashboard_meta WHERE visibility IN ('public', 'team') "
            ") ORDER BY dashboard_id",
            (user_id, user_id),
        ).fetchall()
        return [row[0] for row in rows]
    finally:
        conn.close()


# ── Dashboard Sharing ────────────────────────────────────────────────────────

def share_dashboard(dashboard_id: str, user_id: str, access_level: str = "view") -> None:
    """Share a dashboard with a user."""
    conn = _get_conn()
    try:
        share_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO dashboard_shares (id, dashboard_id, user_id, access_level, created_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(dashboard_id, user_id) DO UPDATE SET access_level = excluded.access_level",
            (share_id, dashboard_id, user_id, access_level, now),
        )
        conn.commit()
    finally:
        conn.close()


def unshare_dashboard(dashboard_id: str, user_id: str) -> None:
    """Remove a user's access to a dashboard."""
    conn = _get_conn()
    try:
        conn.execute(
            "DELETE FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
            (dashboard_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def can_access_dashboard(dashboard_id: str, user_id: str) -> bool:
    """Check if a user can access a dashboard."""
    meta = get_dashboard_meta(dashboard_id)
    if not meta:
        return True  # No metadata = legacy dashboard, allow access
    if meta["visibility"] == "public":
        return True
    if meta["visibility"] == "team":
        return True  # All authenticated users can see team dashboards
    if meta["owner_id"] == user_id:
        return True

    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
            (dashboard_id, user_id),
        ).fetchone()
        return row is not None
    finally:
        conn.close()
