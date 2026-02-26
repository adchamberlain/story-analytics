"""
Metadata store for users, dashboard ownership, and sharing.

Chart/dashboard JSON files remain on disk (Git-friendly).
The metadata database tracks ownership, visibility, and access control.

When AUTH_ENABLED=false (default), all operations use a default user
and all dashboards are effectively public.
"""

from __future__ import annotations

import json as _json
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from api.services.db import get_db

_TABLES_CREATED = False


def _ensure_tables() -> None:
    """Create metadata tables if they don't exist (idempotent)."""
    global _TABLES_CREATED
    if _TABLES_CREATED:
        return
    db = get_db()
    db.executescript("""
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

        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            scopes TEXT NOT NULL DEFAULT 'read',
            last_used_at TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
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

        CREATE TABLE IF NOT EXISTS invites (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            token TEXT UNIQUE NOT NULL,
            created_by TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            team_id TEXT,
            team_role TEXT DEFAULT 'member'
        );

        CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    # Migrate invites table: add team columns if missing
    try:
        db.execute("SELECT team_id FROM invites LIMIT 0")
    except Exception:
        db.execute("ALTER TABLE invites ADD COLUMN team_id TEXT")
        db.execute("ALTER TABLE invites ADD COLUMN team_role TEXT DEFAULT 'member'")
    _TABLES_CREATED = True


# ── Default User (for AUTH_ENABLED=false) ────────────────────────────────────

DEFAULT_USER_ID = "default-user"
DEFAULT_USER_EMAIL = "default@local"


def ensure_default_user() -> str:
    """Ensure the default user exists. Returns the user ID."""
    _ensure_tables()
    db = get_db()
    row = db.fetchone("SELECT id FROM users WHERE id = ?", (DEFAULT_USER_ID,))
    if not row:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            "INSERT INTO users (id, email, password_hash, display_name, role, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (DEFAULT_USER_ID, DEFAULT_USER_EMAIL, "", "Default User", "admin", now),
        )
    return DEFAULT_USER_ID


# ── User CRUD ────────────────────────────────────────────────────────────────

def create_user(email: str, password_hash: str, display_name: str | None = None) -> dict:
    """Create a new user. Returns user dict."""
    _ensure_tables()
    db = get_db()
    user_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    # First user becomes admin
    row = db.fetchone("SELECT COUNT(*) AS cnt FROM users WHERE id != ?", (DEFAULT_USER_ID,))
    count = row["cnt"] if row else 0
    role = "admin" if count == 0 else "editor"

    db.execute(
        "INSERT INTO users (id, email, password_hash, display_name, role, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, email, password_hash, display_name or email, role, now),
    )
    return {"id": user_id, "email": email, "display_name": display_name or email, "role": role}


def get_user_by_email(email: str) -> dict | None:
    """Lookup user by email."""
    _ensure_tables()
    db = get_db()
    return db.fetchone(
        "SELECT id, email, password_hash, display_name, role FROM users WHERE email = ? AND is_active = 1",
        (email,),
    )


def update_user_password(user_id: str, password_hash: str) -> bool:
    """Update a user's password hash. Returns True if user was found and updated."""
    _ensure_tables()
    db = get_db()
    row = db.fetchone("SELECT id FROM users WHERE id = ? AND is_active = 1", (user_id,))
    if not row:
        return False
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
    return True


def get_user_by_id(user_id: str) -> dict | None:
    """Lookup user by ID."""
    _ensure_tables()
    db = get_db()
    return db.fetchone(
        "SELECT id, email, display_name, role FROM users WHERE id = ? AND is_active = 1",
        (user_id,),
    )


# ── User Management ──────────────────────────────────────────────────────────

def list_all_users() -> list[dict]:
    """List all real users (excluding default user), without password hashes."""
    _ensure_tables()
    db = get_db()
    return db.fetchall(
        "SELECT id, email, display_name, role, created_at, is_active "
        "FROM users WHERE id != ? ORDER BY created_at",
        (DEFAULT_USER_ID,),
    )


def update_user_role(user_id: str, role: str) -> bool:
    """Update a user's role. Returns True if valid and updated."""
    if role not in ("admin", "editor"):
        return False
    _ensure_tables()
    db = get_db()
    count = db.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    return count > 0


def update_user_status(user_id: str, active: bool) -> bool:
    """Activate or deactivate a user. Returns True if updated."""
    _ensure_tables()
    db = get_db()
    count = db.execute(
        "UPDATE users SET is_active = ? WHERE id = ?",
        (1 if active else 0, user_id),
    )
    return count > 0


def update_user_display_name(user_id: str, display_name: str) -> bool:
    """Update a user's display name. Returns True if updated."""
    _ensure_tables()
    db = get_db()
    count = db.execute(
        "UPDATE users SET display_name = ? WHERE id = ? AND is_active = 1",
        (display_name, user_id),
    )
    return count > 0


# ── Invites ───────────────────────────────────────────────────────────────────

def create_invite(email: str, role: str, created_by: str, *, team_id: str | None = None, team_role: str | None = None) -> dict:
    """Create an invite token. Expires in 7 days. If team_id is set, auto-joins team on registration."""
    _ensure_tables()
    db = get_db()
    invite_id = uuid.uuid4().hex[:12]
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=7)).isoformat()
    db.execute(
        "INSERT INTO invites (id, email, role, token, created_by, expires_at, team_id, team_role) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (invite_id, email, role, token, created_by, expires_at, team_id, team_role),
    )
    return {
        "id": invite_id, "email": email, "role": role,
        "token": token, "created_by": created_by,
        "expires_at": expires_at, "used_at": None,
        "team_id": team_id, "team_role": team_role,
    }


def list_invites() -> list[dict]:
    """List all pending (unused, unexpired) invites."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    return db.fetchall(
        "SELECT id, email, role, token, created_by, expires_at, team_id, team_role "
        "FROM invites WHERE used_at IS NULL AND expires_at > ? "
        "ORDER BY expires_at",
        (now,),
    )


def get_invite_by_token(token: str) -> dict | None:
    """Get a valid (unused, unexpired) invite by token."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    return db.fetchone(
        "SELECT * FROM invites WHERE token = ? AND used_at IS NULL AND expires_at > ?",
        (token, now),
    )


def mark_invite_used(invite_id: str) -> None:
    """Mark an invite as used."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    db.execute("UPDATE invites SET used_at = ? WHERE id = ?", (now, invite_id))


def delete_invite(invite_id: str) -> bool:
    """Delete an invite. Returns True if deleted."""
    _ensure_tables()
    db = get_db()
    count = db.execute("DELETE FROM invites WHERE id = ?", (invite_id,))
    return count > 0


def get_pending_team_invites(team_id: str) -> list[dict]:
    """List pending invites for a specific team."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    return db.fetchall(
        "SELECT id, email, team_role, created_by, expires_at "
        "FROM invites WHERE team_id = ? AND used_at IS NULL AND expires_at > ? "
        "ORDER BY expires_at",
        (team_id, now),
    )


# ── Admin Settings ────────────────────────────────────────────────────────────

def get_admin_setting(key: str) -> str:
    """Get an admin setting value. Returns default for known keys."""
    _ensure_tables()
    db = get_db()
    defaults = {"open_registration": "true"}
    row = db.fetchone("SELECT value FROM admin_settings WHERE key = ?", (key,))
    if row:
        return row["value"]
    return defaults.get(key, "")


def set_admin_setting(key: str, value: str) -> None:
    """Set an admin setting."""
    _ensure_tables()
    db = get_db()
    db.execute(
        "INSERT INTO admin_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


# ── Dashboard Metadata ───────────────────────────────────────────────────────

def set_dashboard_meta(dashboard_id: str, owner_id: str, visibility: str = "private") -> None:
    """Create or update dashboard metadata.

    Preserves created_at on update (INSERT OR REPLACE would overwrite it).
    """
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO dashboard_meta (dashboard_id, owner_id, visibility, created_at) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(dashboard_id) DO UPDATE SET owner_id = excluded.owner_id, visibility = excluded.visibility",
        (dashboard_id, owner_id, visibility, now),
    )


def get_dashboard_meta(dashboard_id: str) -> dict | None:
    """Get dashboard metadata."""
    _ensure_tables()
    db = get_db()
    return db.fetchone(
        "SELECT dashboard_id, owner_id, visibility FROM dashboard_meta WHERE dashboard_id = ?",
        (dashboard_id,),
    )


_VALID_VISIBILITY = {"private", "team", "public"}


def update_dashboard_visibility(dashboard_id: str, visibility: str) -> None:
    """Update dashboard visibility (private, team, public)."""
    if visibility not in _VALID_VISIBILITY:
        raise ValueError(f"Invalid visibility: {visibility!r}. Must be one of {_VALID_VISIBILITY}")
    _ensure_tables()
    db = get_db()
    db.execute(
        "UPDATE dashboard_meta SET visibility = ? WHERE dashboard_id = ?",
        (visibility, dashboard_id),
    )


def list_accessible_dashboards(user_id: str) -> list[str]:
    """List dashboard IDs accessible to a user (owned, shared, or public)."""
    _ensure_tables()
    db = get_db()
    rows = db.fetchall(
        "SELECT DISTINCT dashboard_id FROM ("
        "  SELECT dashboard_id FROM dashboard_meta WHERE owner_id = ? "
        "  UNION "
        "  SELECT dashboard_id FROM dashboard_shares WHERE user_id = ? "
        "  UNION "
        "  SELECT dashboard_id FROM dashboard_meta WHERE visibility IN ('public', 'team') "
        ") ORDER BY dashboard_id",
        (user_id, user_id),
    )
    return [row["dashboard_id"] for row in rows]


# ── Dashboard Sharing ────────────────────────────────────────────────────────

def share_dashboard(dashboard_id: str, user_id: str, access_level: str = "view") -> None:
    """Share a dashboard with a user."""
    _ensure_tables()
    db = get_db()
    share_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO dashboard_shares (id, dashboard_id, user_id, access_level, created_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(dashboard_id, user_id) DO UPDATE SET access_level = excluded.access_level",
        (share_id, dashboard_id, user_id, access_level, now),
    )


def unshare_dashboard(dashboard_id: str, user_id: str) -> None:
    """Remove a user's access to a dashboard."""
    _ensure_tables()
    db = get_db()
    db.execute(
        "DELETE FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
        (dashboard_id, user_id),
    )


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

    db = get_db()
    row = db.fetchone(
        "SELECT id FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
        (dashboard_id, user_id),
    )
    return row is not None


# ── API Key Management ─────────────────────────────────────────────────────


def create_api_key(user_id: str, name: str, key_hash: str, key_prefix: str, scopes: str = "read", expires_at: str | None = None) -> dict:
    """Create a new API key record."""
    _ensure_tables()
    db = get_db()
    key_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (key_id, user_id, name, key_hash, key_prefix, scopes, now, expires_at),
    )
    return {"id": key_id, "name": name, "key_prefix": key_prefix, "scopes": scopes, "created_at": now, "expires_at": expires_at}


def list_api_keys(user_id: str) -> list[dict]:
    """List API keys for a user (prefix only, no hash)."""
    _ensure_tables()
    db = get_db()
    return db.fetchall(
        "SELECT id, name, key_prefix, scopes, last_used_at, created_at, expires_at "
        "FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    )


def get_api_key_by_prefix(prefix: str) -> dict | None:
    """Lookup API key by its prefix."""
    _ensure_tables()
    db = get_db()
    return db.fetchone(
        "SELECT id, user_id, key_hash, key_prefix, scopes, expires_at FROM api_keys WHERE key_prefix = ?",
        (prefix,),
    )


def update_api_key_last_used(key_id: str) -> None:
    """Update the last_used_at timestamp for an API key."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    db.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", (now, key_id))


def delete_api_key(key_id: str, user_id: str) -> bool:
    """Delete an API key. Returns True if deleted."""
    _ensure_tables()
    db = get_db()
    count = db.execute(
        "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
        (key_id, user_id),
    )
    return count > 0


# ── Comments ─────────────────────────────────────────────────────────────────

def create_comment(chart_id: str | None, dashboard_id: str | None, parent_id: str | None, author_id: str, body: str) -> dict:
    """Create a comment. Must target either a chart or a dashboard."""
    _ensure_tables()
    db = get_db()
    comment_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO comments (id, chart_id, dashboard_id, parent_id, author_id, body, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (comment_id, chart_id, dashboard_id, parent_id, author_id, body, now),
    )
    return {"id": comment_id, "chart_id": chart_id, "dashboard_id": dashboard_id, "parent_id": parent_id, "author_id": author_id, "body": body, "created_at": now, "updated_at": None, "deleted_at": None}


def list_comments(chart_id: str | None = None, dashboard_id: str | None = None) -> list[dict]:
    """List comments for a chart or dashboard, excluding soft-deleted ones."""
    _ensure_tables()
    db = get_db()
    if chart_id:
        return db.fetchall(
            "SELECT c.*, u.display_name as author_name FROM comments c "
            "LEFT JOIN users u ON c.author_id = u.id "
            "WHERE c.chart_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at",
            (chart_id,),
        )
    elif dashboard_id:
        return db.fetchall(
            "SELECT c.*, u.display_name as author_name FROM comments c "
            "LEFT JOIN users u ON c.author_id = u.id "
            "WHERE c.dashboard_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at",
            (dashboard_id,),
        )
    else:
        return []


def update_comment(comment_id: str, author_id: str, body: str) -> dict | None:
    """Update a comment body (only by the author)."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    count = db.execute(
        "UPDATE comments SET body = ?, updated_at = ? WHERE id = ? AND author_id = ? AND deleted_at IS NULL",
        (body, now, comment_id, author_id),
    )
    if count == 0:
        return None
    return db.fetchone("SELECT * FROM comments WHERE id = ?", (comment_id,))


def delete_comment(comment_id: str, author_id: str) -> bool:
    """Soft-delete a comment (only by the author)."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    count = db.execute(
        "UPDATE comments SET deleted_at = ? WHERE id = ? AND author_id = ? AND deleted_at IS NULL",
        (now, comment_id, author_id),
    )
    return count > 0


# ── Teams ────────────────────────────────────────────────────────────────────

def create_team(name: str, owner_id: str, description: str | None = None) -> dict:
    """Create a team."""
    _ensure_tables()
    db = get_db()
    team_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO teams (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (team_id, name, description, owner_id, now),
    )
    # Add owner as member with 'admin' role
    member_id = uuid.uuid4().hex[:12]
    db.execute(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
        (member_id, team_id, owner_id, "admin", now),
    )
    return {"id": team_id, "name": name, "description": description, "owner_id": owner_id, "created_at": now}


def list_teams(user_id: str) -> list[dict]:
    """List teams a user belongs to."""
    _ensure_tables()
    db = get_db()
    return db.fetchall(
        "SELECT t.* FROM teams t JOIN team_members tm ON t.id = tm.team_id WHERE tm.user_id = ? ORDER BY t.name",
        (user_id,),
    )


def get_team(team_id: str) -> dict | None:
    """Get team by ID."""
    _ensure_tables()
    db = get_db()
    return db.fetchone("SELECT * FROM teams WHERE id = ?", (team_id,))


def get_team_members(team_id: str) -> list[dict]:
    """Get members of a team."""
    _ensure_tables()
    db = get_db()
    return db.fetchall(
        "SELECT tm.*, u.email, u.display_name FROM team_members tm "
        "JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ? ORDER BY tm.joined_at",
        (team_id,),
    )


def add_team_member(team_id: str, user_id: str, role: str = "member") -> dict:
    """Add a user to a team."""
    _ensure_tables()
    db = get_db()
    member_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role",
        (member_id, team_id, user_id, role, now),
    )
    return {"id": member_id, "team_id": team_id, "user_id": user_id, "role": role, "joined_at": now}


def remove_team_member(team_id: str, user_id: str) -> bool:
    """Remove a user from a team."""
    _ensure_tables()
    db = get_db()
    count = db.execute(
        "DELETE FROM team_members WHERE team_id = ? AND user_id = ?",
        (team_id, user_id),
    )
    return count > 0


def get_team_member_role(team_id: str, user_id: str) -> str | None:
    """Get a user's role in a team, or None if not a member."""
    _ensure_tables()
    db = get_db()
    row = db.fetchone(
        "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
        (team_id, user_id),
    )
    return row["role"] if row else None


def delete_team(team_id: str, owner_id: str) -> bool:
    """Delete a team (owner only)."""
    _ensure_tables()
    db = get_db()
    # Verify ownership first
    row = db.fetchone("SELECT id FROM teams WHERE id = ? AND owner_id = ?", (team_id, owner_id))
    if not row:
        return False
    # Delete members first (FK constraint)
    db.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
    db.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    return True


# ── Notifications ────────────────────────────────────────────────────────────

def create_notification(user_id: str, notification_type: str, payload: dict) -> dict:
    """Create a notification."""
    _ensure_tables()
    db = get_db()
    notif_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO notifications (id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        (notif_id, user_id, notification_type, _json.dumps(payload), now),
    )
    return {"id": notif_id, "user_id": user_id, "type": notification_type, "payload": payload, "read_at": None, "created_at": now}


def list_notifications(user_id: str, limit: int = 50) -> list[dict]:
    """List recent notifications for a user."""
    _ensure_tables()
    db = get_db()
    rows = db.fetchall(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    )
    result = []
    for d in rows:
        d["payload"] = _json.loads(d["payload"]) if isinstance(d["payload"], str) else d["payload"]
        result.append(d)
    return result


def get_unread_count(user_id: str) -> int:
    """Get count of unread notifications."""
    _ensure_tables()
    db = get_db()
    row = db.fetchone(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL",
        (user_id,),
    )
    return row["cnt"] if row else 0


def mark_notification_read(notification_id: str, user_id: str) -> bool:
    """Mark a single notification as read."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    count = db.execute(
        "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
        (now, notification_id, user_id),
    )
    return count > 0


def mark_all_notifications_read(user_id: str) -> int:
    """Mark all notifications as read. Returns count marked."""
    _ensure_tables()
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    return db.execute(
        "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
        (now, user_id),
    )
