"""
Regression test: source_id regex must enforce exactly 12 hex characters.

Bug: The regex `^[a-f0-9]{1,32}$` allowed source IDs as short as 1 character,
but all generated IDs are 12-char hex from uuid4().hex[:12]. A 1-char source_id
could bypass validation and reference wrong or nonexistent tables.
Fix: Changed to `^[a-f0-9]{12}$` to match the generation format exactly.
"""

import re

import pytest

from api.services.duckdb_service import _SAFE_SOURCE_ID_RE


@pytest.mark.unit
class TestSourceIdRegex:
    def test_valid_12_char_hex(self):
        """A 12-character hex string should match."""
        assert _SAFE_SOURCE_ID_RE.match("abcdef012345")

    def test_rejects_1_char_id(self):
        """A 1-character hex string should NOT match."""
        assert not _SAFE_SOURCE_ID_RE.match("a")

    def test_rejects_11_char_id(self):
        """An 11-character hex string should NOT match."""
        assert not _SAFE_SOURCE_ID_RE.match("abcdef01234")

    def test_rejects_13_char_id(self):
        """A 13-character hex string should NOT match."""
        assert not _SAFE_SOURCE_ID_RE.match("abcdef0123456")

    def test_rejects_non_hex(self):
        """Non-hex characters should not match."""
        assert not _SAFE_SOURCE_ID_RE.match("abcdef01234g")

    def test_rejects_empty(self):
        """Empty string should not match."""
        assert not _SAFE_SOURCE_ID_RE.match("")
