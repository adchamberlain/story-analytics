"""
Database connection package.

Provides a unified ``DatabaseConnection`` that works with both SQLite and
PostgreSQL, and a ``get_db()`` factory for singleton access.
"""
from __future__ import annotations

from functools import lru_cache

from .connection import DatabaseConnection


@lru_cache(maxsize=1)
def get_db() -> DatabaseConnection:
    """Return a singleton DatabaseConnection instance.

    Uses ``DATABASE_URL`` env var or falls back to the local SQLite default.
    """
    return DatabaseConnection()


__all__ = ["DatabaseConnection", "get_db"]
