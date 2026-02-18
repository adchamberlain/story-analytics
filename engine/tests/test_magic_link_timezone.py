"""
Regression test: magic link expires_at must be timezone-aware.

Bug: The MagicLink model's expires_at column was defined as DateTime without
timezone=True, storing naive datetimes. The is_valid property compared
datetime.now(timezone.utc) (aware) against the naive expires_at, raising
TypeError: can't compare offset-naive and offset-aware datetimes.
Fix: Changed Column(DateTime, ...) to Column(DateTime(timezone=True), ...).
"""

from datetime import datetime, timedelta, timezone

import pytest

from api.models.magic_link import MagicLink


@pytest.mark.unit
class TestMagicLinkTimezone:
    def test_create_produces_aware_expires_at(self):
        """MagicLink.create() should produce a timezone-aware expires_at."""
        link = MagicLink.create("test@example.com", expires_minutes=15)
        assert link.expires_at.tzinfo is not None

    def test_is_valid_does_not_raise_on_comparison(self):
        """is_valid should not raise TypeError from naive vs aware comparison."""
        link = MagicLink.create("test@example.com", expires_minutes=15)
        # Should not raise — both sides are now timezone-aware
        result = link.is_valid
        assert result is True

    def test_expired_link_is_not_valid(self):
        """A link with expires_at in the past should not be valid."""
        link = MagicLink.create("test@example.com", expires_minutes=15)
        link.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        assert link.is_valid is False

    def test_used_link_is_not_valid(self):
        """A used link should not be valid even if not expired."""
        link = MagicLink.create("test@example.com", expires_minutes=15)
        link.used = True
        assert link.is_valid is False
