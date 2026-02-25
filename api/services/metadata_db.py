"""
SQLite metadata store for users, dashboard ownership, and sharing.

Chart/dashboard JSON files remain on disk (Git-friendly).
SQLite tracks ownership, visibility, and access control metadata.

When AUTH_ENABLED=false (default), all operations use a default user
and all dashboards are effectively public.
"""

from __future__ import annotations

import json as _json
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

        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            chart_id TEXT,
            dashboard_id TEXT,
            parent_id TEXT,
            author_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            deleted_at TEXT,
            FOREIGN KEY (author_id) REFERENCES users(id),
            FOREIGN KEY (parent_id) REFERENCES comments(id)
        );

        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            owner_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS team_members (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT NOT NULL,
            FOREIGN KEY (team_id) REFERENCES teams(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(team_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            read_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
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


# ── Comments ─────────────────────────────────────────────────────────────────

def create_comment(chart_id: str | None, dashboard_id: str | None, parent_id: str | None, author_id: str, body: str) -> dict:
    """Create a comment. Must target either a chart or a dashboard."""
    conn = _get_conn()
    try:
        comment_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO comments (id, chart_id, dashboard_id, parent_id, author_id, body, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (comment_id, chart_id, dashboard_id, parent_id, author_id, body, now),
        )
        conn.commit()
        return {"id": comment_id, "chart_id": chart_id, "dashboard_id": dashboard_id, "parent_id": parent_id, "author_id": author_id, "body": body, "created_at": now, "updated_at": None, "deleted_at": None}
    finally:
        conn.close()


def list_comments(chart_id: str | None = None, dashboard_id: str | None = None) -> list[dict]:
    """List comments for a chart or dashboard, excluding soft-deleted ones."""
    conn = _get_conn()
    try:
        if chart_id:
            rows = conn.execute(
                "SELECT c.*, u.display_name as author_name FROM comments c "
                "LEFT JOIN users u ON c.author_id = u.id "
                "WHERE c.chart_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at",
                (chart_id,),
            ).fetchall()
        elif dashboard_id:
            rows = conn.execute(
                "SELECT c.*, u.display_name as author_name FROM comments c "
                "LEFT JOIN users u ON c.author_id = u.id "
                "WHERE c.dashboard_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at",
                (dashboard_id,),
            ).fetchall()
        else:
            return []
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_comment(comment_id: str, author_id: str, body: str) -> dict | None:
    """Update a comment body (only by the author)."""
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE comments SET body = ?, updated_at = ? WHERE id = ? AND author_id = ? AND deleted_at IS NULL",
            (body, now, comment_id, author_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_comment(comment_id: str, author_id: str) -> bool:
    """Soft-delete a comment (only by the author)."""
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE comments SET deleted_at = ? WHERE id = ? AND author_id = ? AND deleted_at IS NULL",
            (now, comment_id, author_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


# ── Teams ────────────────────────────────────────────────────────────────────

def create_team(name: str, owner_id: str, description: str | None = None) -> dict:
    """Create a team."""
    conn = _get_conn()
    try:
        team_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO teams (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (team_id, name, description, owner_id, now),
        )
        # Add owner as member with 'admin' role
        member_id = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
            (member_id, team_id, owner_id, "admin", now),
        )
        conn.commit()
        return {"id": team_id, "name": name, "description": description, "owner_id": owner_id, "created_at": now}
    finally:
        conn.close()


def list_teams(user_id: str) -> list[dict]:
    """List teams a user belongs to."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT t.* FROM teams t JOIN team_members tm ON t.id = tm.team_id WHERE tm.user_id = ? ORDER BY t.name",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_team(team_id: str) -> dict | None:
    """Get team by ID."""
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_team_members(team_id: str) -> list[dict]:
    """Get members of a team."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT tm.*, u.email, u.display_name FROM team_members tm "
            "JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ? ORDER BY tm.joined_at",
            (team_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def add_team_member(team_id: str, user_id: str, role: str = "member") -> dict:
    """Add a user to a team."""
    conn = _get_conn()
    try:
        member_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role",
            (member_id, team_id, user_id, role, now),
        )
        conn.commit()
        return {"id": member_id, "team_id": team_id, "user_id": user_id, "role": role, "joined_at": now}
    finally:
        conn.close()


def remove_team_member(team_id: str, user_id: str) -> bool:
    """Remove a user from a team."""
    conn = _get_conn()
    try:
        cursor = conn.execute(
            "DELETE FROM team_members WHERE team_id = ? AND user_id = ?",
            (team_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_team(team_id: str, owner_id: str) -> bool:
    """Delete a team (owner only)."""
    conn = _get_conn()
    try:
        # Verify ownership first
        row = conn.execute("SELECT id FROM teams WHERE id = ? AND owner_id = ?", (team_id, owner_id)).fetchone()
        if not row:
            return False
        # Delete members first (FK constraint)
        conn.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# ── Notifications ────────────────────────────────────────────────────────────

def create_notification(user_id: str, notification_type: str, payload: dict) -> dict:
    """Create a notification."""
    conn = _get_conn()
    try:
        notif_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO notifications (id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (notif_id, user_id, notification_type, _json.dumps(payload), now),
        )
        conn.commit()
        return {"id": notif_id, "user_id": user_id, "type": notification_type, "payload": payload, "read_at": None, "created_at": now}
    finally:
        conn.close()


def list_notifications(user_id: str, limit: int = 50) -> list[dict]:
    """List recent notifications for a user."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["payload"] = _json.loads(d["payload"]) if isinstance(d["payload"], str) else d["payload"]
            result.append(d)
        return result
    finally:
        conn.close()


def get_unread_count(user_id: str) -> int:
    """Get count of unread notifications."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL",
            (user_id,),
        ).fetchone()
        return row[0] if row else 0
    finally:
        conn.close()


def mark_notification_read(notification_id: str, user_id: str) -> bool:
    """Mark a single notification as read."""
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
            (now, notification_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def mark_all_notifications_read(user_id: str) -> int:
    """Mark all notifications as read. Returns count marked."""
    conn = _get_conn()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
            (now, user_id),
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()
