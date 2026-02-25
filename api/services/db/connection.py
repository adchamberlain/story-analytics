"""
Database connection wrapper that supports both SQLite and PostgreSQL.

Queries use ? placeholders (SQLite style). When connected to Postgres,
placeholders are automatically converted to %s before execution.
"""
from __future__ import annotations

import os
import sqlite3


class DatabaseConnection:
    """Unified database connection for SQLite and PostgreSQL.

    Constructor takes an optional ``url`` parameter.  Falls back to the
    ``DATABASE_URL`` environment variable, then to a local SQLite file.

    SQLite URLs: ``sqlite:///path/to/db`` or ``sqlite://:memory:``
    Postgres URLs: ``postgresql://user:pass@host/db``
    """

    def __init__(self, url: str | None = None) -> None:
        url = url or os.environ.get("DATABASE_URL", "sqlite:///data/metadata.db")

        if url.startswith("postgresql"):
            self._is_postgres = True
            self._init_postgres(url)
        else:
            self._is_postgres = False
            self._init_sqlite(url)

    # ── backend init ─────────────────────────────────────────────────────────

    def _init_sqlite(self, url: str) -> None:
        """Initialise a SQLite connection from a ``sqlite://`` URL."""
        # sqlite:///data/metadata.db  -> path = data/metadata.db
        # sqlite://:memory:           -> path = :memory:
        path = url.removeprefix("sqlite://")
        # Remove leading / for relative paths, keep :memory: as-is
        if path.startswith("/") and not path.startswith("/:memory:"):
            path = path[1:]  # sqlite:///data/x.db -> data/x.db
        elif path.startswith("/:memory:"):
            path = ":memory:"

        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")

    def _init_postgres(self, url: str) -> None:
        """Initialise a PostgreSQL connection via psycopg2."""
        try:
            import psycopg2
            import psycopg2.extras
        except ImportError as exc:
            raise ImportError(
                "psycopg2 is required for PostgreSQL connections. "
                "Install it with: pip install psycopg2-binary"
            ) from exc

        self._conn = psycopg2.connect(url)
        self._conn.autocommit = False
        # Store cursor factory for dict rows
        self._cursor_factory = psycopg2.extras.RealDictCursor

    # ── placeholder conversion ───────────────────────────────────────────────

    def _convert_query(self, query: str) -> str:
        """Convert ``?`` placeholders to ``%s`` for PostgreSQL.

        For SQLite this is a no-op.
        """
        if not self._is_postgres:
            return query
        # Replace ? that are not inside single-quoted strings.
        # Simple approach: split on single quotes, only convert in
        # even-indexed segments (outside quotes).
        parts = query.split("'")
        for i in range(0, len(parts), 2):
            parts[i] = parts[i].replace("?", "%s")
        return "'".join(parts)

    # ── query methods ────────────────────────────────────────────────────────

    def execute(self, query: str, params: tuple = ()) -> int:
        """Execute a query, commit, and return the number of affected rows."""
        converted = self._convert_query(query)
        if self._is_postgres:
            cur = self._conn.cursor()
            cur.execute(converted, params)
            rowcount = cur.rowcount
            self._conn.commit()
            cur.close()
        else:
            cur = self._conn.execute(converted, params)
            self._conn.commit()
            rowcount = cur.rowcount
        return rowcount

    def fetchone(self, query: str, params: tuple = ()) -> dict | None:
        """Execute a query and return the first row as a dict, or None."""
        converted = self._convert_query(query)
        if self._is_postgres:
            cur = self._conn.cursor(cursor_factory=self._cursor_factory)
            cur.execute(converted, params)
            row = cur.fetchone()
            cur.close()
            return dict(row) if row else None
        else:
            cur = self._conn.execute(converted, params)
            row = cur.fetchone()
            return dict(row) if row else None

    def fetchall(self, query: str, params: tuple = ()) -> list[dict]:
        """Execute a query and return all rows as a list of dicts."""
        converted = self._convert_query(query)
        if self._is_postgres:
            cur = self._conn.cursor(cursor_factory=self._cursor_factory)
            cur.execute(converted, params)
            rows = cur.fetchall()
            cur.close()
            return [dict(r) for r in rows]
        else:
            cur = self._conn.execute(converted, params)
            return [dict(r) for r in cur.fetchall()]

    def executescript(self, script: str) -> None:
        """Execute a multi-statement SQL script.

        For SQLite uses the native ``executescript()`` method.
        For PostgreSQL executes the entire script as one ``cursor.execute()``.
        """
        if self._is_postgres:
            cur = self._conn.cursor()
            cur.execute(script)
            self._conn.commit()
            cur.close()
        else:
            self._conn.executescript(script)

    # ── lifecycle ────────────────────────────────────────────────────────────

    def close(self) -> None:
        """Close the underlying database connection."""
        self._conn.close()
