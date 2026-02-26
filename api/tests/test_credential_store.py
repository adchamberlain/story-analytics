"""
Tests for credential_store: encrypted credential storage using Fernet.

Uses tmp_path fixtures to isolate from production data directory.
"""
from __future__ import annotations

import json

import pytest


@pytest.fixture(autouse=True)
def _isolate_credential_dir(tmp_path, monkeypatch):
    """Redirect credential storage to a temp directory for every test."""
    monkeypatch.setattr(
        "api.services.credential_store._CREDENTIALS_DIR",
        tmp_path,
    )
    # Force re-generation of the key for each test (clean slate)
    monkeypatch.setattr(
        "api.services.credential_store._fernet",
        None,
    )


class TestCredentialStoreRoundtrip:
    """store then load returns the same data."""

    def test_roundtrip_simple(self, tmp_path):
        from api.services.credential_store import store_credentials, load_credentials

        creds = {"username": "alice", "password": "s3cret"}
        store_credentials("conn1", creds)
        loaded = load_credentials("conn1")
        assert loaded == creds

    def test_roundtrip_complex(self, tmp_path):
        from api.services.credential_store import store_credentials, load_credentials

        creds = {
            "host": "db.example.com",
            "port": 5432,
            "username": "bob",
            "password": "p@$$w0rd!",
            "options": {"ssl": True, "timeout": 30},
        }
        store_credentials("conn2", creds)
        loaded = load_credentials("conn2")
        assert loaded == creds


class TestCredentialStoreLoadNonexistent:
    """load_credentials returns None for unknown connection IDs."""

    def test_load_nonexistent_returns_none(self):
        from api.services.credential_store import load_credentials

        assert load_credentials("does_not_exist") is None


class TestCredentialStoreDelete:
    """delete then load returns None; delete nonexistent doesn't error."""

    def test_delete_then_load(self, tmp_path):
        from api.services.credential_store import (
            store_credentials,
            load_credentials,
            delete_credentials,
        )

        store_credentials("conn3", {"password": "abc"})
        assert load_credentials("conn3") is not None
        delete_credentials("conn3")
        assert load_credentials("conn3") is None

    def test_delete_nonexistent_no_error(self):
        from api.services.credential_store import delete_credentials

        # Should not raise
        delete_credentials("nonexistent_id")


class TestCredentialStoreEncryption:
    """Verify credentials are actually encrypted on disk."""

    def test_raw_bytes_do_not_contain_plaintext(self, tmp_path):
        from api.services.credential_store import store_credentials

        password = "super_secret_password_12345"
        store_credentials("conn4", {"password": password})

        # Find the .enc file
        enc_files = list(tmp_path.glob("*.enc"))
        assert len(enc_files) == 1

        raw = enc_files[0].read_bytes()
        # The plaintext password should NOT appear in the raw encrypted bytes
        assert password.encode() not in raw
        # Also check the JSON key name doesn't appear
        assert b'"password"' not in raw


class TestCredentialStoreOverwrite:
    """Storing twice overwrites; load returns latest."""

    def test_overwrite(self, tmp_path):
        from api.services.credential_store import store_credentials, load_credentials

        store_credentials("conn5", {"password": "old"})
        store_credentials("conn5", {"password": "new", "extra": "field"})
        loaded = load_credentials("conn5")
        assert loaded == {"password": "new", "extra": "field"}
