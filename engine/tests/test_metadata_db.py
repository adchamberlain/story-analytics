"""
Regression tests for metadata_db.py.

Bug: set_dashboard_meta() used INSERT OR REPLACE which overwrites created_at
on every update, losing the original creation timestamp.
Fix: Changed to INSERT ... ON CONFLICT DO UPDATE SET (only owner_id, visibility).
"""

import pytest

from api.services.metadata_db import (
    set_dashboard_meta, get_dashboard_meta, DEFAULT_USER_ID,
    ensure_default_user,
)
from api.services.db import get_db


@pytest.fixture(autouse=True)
def tmp_metadata_db(monkeypatch, tmp_path):
    """Redirect metadata DB to a temp path."""
    import api.services.metadata_db as mdb
    monkeypatch.setattr(mdb, "DB_PATH", tmp_path / "metadata.db")
    ensure_default_user()


@pytest.mark.unit
class TestSetDashboardMeta:
    def test_creates_new_entry(self):
        set_dashboard_meta("dash_001", DEFAULT_USER_ID, "private")
        meta = get_dashboard_meta("dash_001")
        assert meta is not None
        assert meta["owner_id"] == DEFAULT_USER_ID
        assert meta["visibility"] == "private"

    def test_update_preserves_created_at(self):
        """Regression: updating visibility must not overwrite created_at."""
        set_dashboard_meta("dash_002", DEFAULT_USER_ID, "private")
        meta_before = get_dashboard_meta("dash_002")

        # Fetch created_at from the database directly
        db = get_db()
        row = db.fetchone(
            "SELECT created_at FROM dashboard_meta WHERE dashboard_id = ?",
            ("dash_002",),
        )
        created_at_before = row["created_at"]

        # Update visibility
        set_dashboard_meta("dash_002", DEFAULT_USER_ID, "public")

        row = db.fetchone(
            "SELECT created_at FROM dashboard_meta WHERE dashboard_id = ?",
            ("dash_002",),
        )
        created_at_after = row["created_at"]

        assert created_at_before == created_at_after

        meta_after = get_dashboard_meta("dash_002")
        assert meta_after["visibility"] == "public"

    def test_update_changes_visibility(self):
        set_dashboard_meta("dash_003", DEFAULT_USER_ID, "private")
        set_dashboard_meta("dash_003", DEFAULT_USER_ID, "team")
        meta = get_dashboard_meta("dash_003")
        assert meta["visibility"] == "team"
