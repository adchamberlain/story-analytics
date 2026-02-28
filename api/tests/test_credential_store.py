"""
Tests for credential_store: encrypted credential storage using Fernet.

Uses a temp LocalStorageBackend to isolate from production storage.
"""
from __future__ import annotations

import pytest

from api.services.storage import LocalStorageBackend


@pytest.fixture(autouse=True)
def _isolate_credential_store(tmp_path, monkeypatch):
    """Redirect credential storage to a temp backend for every test."""
    backend = LocalStorageBackend(str(tmp_path))
    monkeypatch.setattr(
        "api.services.credential_store.get_storage",
        lambda: backend,
    )
    # Force re-generation of the key for each test (clean slate)
    monkeypatch.setattr(
        "api.services.credential_store._fernet",
        None,
    )
    # Clear any env var override between tests
    monkeypatch.delenv("CREDENTIAL_ENCRYPTION_KEY", raising=False)


class TestCredentialStoreRoundtrip:
    """store then load returns the same data."""

    def test_roundtrip_simple(self):
        from api.services.credential_store import store_credentials, load_credentials

        creds = {"username": "alice", "password": "s3cret"}
        store_credentials("aaa111", creds)
        loaded = load_credentials("aaa111")
        assert loaded == creds

    def test_roundtrip_complex(self):
        from api.services.credential_store import store_credentials, load_credentials

        creds = {
            "host": "db.example.com",
            "port": 5432,
            "username": "bob",
            "password": "p@$$w0rd!",
            "options": {"ssl": True, "timeout": 30},
        }
        store_credentials("aaa222", creds)
        loaded = load_credentials("aaa222")
        assert loaded == creds


class TestCredentialStoreLoadNonexistent:
    """load_credentials returns None for unknown connection IDs."""

    def test_load_nonexistent_returns_none(self):
        from api.services.credential_store import load_credentials

        assert load_credentials("deadbeef") is None


class TestCredentialStoreDelete:
    """delete then load returns None; delete nonexistent doesn't error."""

    def test_delete_then_load(self):
        from api.services.credential_store import (
            store_credentials,
            load_credentials,
            delete_credentials,
        )

        store_credentials("aaa333", {"password": "abc"})
        assert load_credentials("aaa333") is not None
        delete_credentials("aaa333")
        assert load_credentials("aaa333") is None

    def test_delete_nonexistent_no_error(self):
        from api.services.credential_store import delete_credentials

        # Should not raise
        delete_credentials("bbb999")


class TestCredentialStoreEncryption:
    """Verify credentials are actually encrypted on disk."""

    def test_raw_bytes_do_not_contain_plaintext(self, tmp_path):
        from api.services.credential_store import store_credentials

        password = "super_secret_password_12345"
        store_credentials("aaa444", {"password": password})

        # Find the .enc file (stored under credentials/ prefix in temp backend)
        creds_dir = tmp_path / "credentials"
        enc_files = list(creds_dir.glob("*.enc"))
        assert len(enc_files) == 1

        raw = enc_files[0].read_bytes()
        # The plaintext password should NOT appear in the raw encrypted bytes
        assert password.encode() not in raw
        # Also check the JSON key name doesn't appear
        assert b'"password"' not in raw


class TestCredentialStoreOverwrite:
    """Storing twice overwrites; load returns latest."""

    def test_overwrite(self):
        from api.services.credential_store import store_credentials, load_credentials

        store_credentials("aaa555", {"password": "old"})
        store_credentials("aaa555", {"password": "new", "extra": "field"})
        loaded = load_credentials("aaa555")
        assert loaded == {"password": "new", "extra": "field"}


class TestCredentialStoreCorrupted:
    """load_credentials returns None gracefully for corrupted .enc files."""

    def test_corrupted_enc_file_returns_none(self, tmp_path):
        from api.services.credential_store import store_credentials, load_credentials

        # Store valid credentials first
        store_credentials("aaa666", {"password": "valid"})

        # Corrupt the .enc file with garbage bytes
        enc_path = tmp_path / "credentials" / "aaa666.enc"
        assert enc_path.exists()
        enc_path.write_bytes(b"this is not valid fernet data at all")

        # load_credentials should return None, not raise
        assert load_credentials("aaa666") is None


class TestCredentialStoreIdValidation:
    """Invalid connection IDs are rejected to prevent path traversal."""

    def test_store_rejects_path_traversal(self):
        from api.services.credential_store import store_credentials

        with pytest.raises(ValueError):
            store_credentials("../etc/passwd", {"password": "bad"})

    def test_load_rejects_path_traversal(self):
        from api.services.credential_store import load_credentials

        with pytest.raises(ValueError):
            load_credentials("../etc/passwd")

    def test_delete_rejects_path_traversal(self):
        from api.services.credential_store import delete_credentials

        with pytest.raises(ValueError):
            delete_credentials("../etc/passwd")

    def test_rejects_non_hex_id(self):
        from api.services.credential_store import store_credentials

        with pytest.raises(ValueError):
            store_credentials("hello_world", {"password": "bad"})


class TestCredentialStoreEnvVarKey:
    """CREDENTIAL_ENCRYPTION_KEY env var takes precedence over stored key."""

    def test_env_var_key_used(self, monkeypatch):
        from cryptography.fernet import Fernet
        from api.services.credential_store import store_credentials, load_credentials

        # Set a known key via env var
        known_key = Fernet.generate_key()
        monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", known_key.decode())
        # Reset cached fernet so it picks up the env var
        monkeypatch.setattr("api.services.credential_store._fernet", None)

        creds = {"password": "env_var_test"}
        store_credentials("aaa777", creds)
        loaded = load_credentials("aaa777")
        assert loaded == creds

    def test_env_var_key_takes_precedence_over_stored(self, tmp_path, monkeypatch):
        from cryptography.fernet import Fernet
        from api.services.credential_store import store_credentials, load_credentials

        # First, store credentials with auto-generated key (no env var)
        store_credentials("aaa888", {"password": "original"})
        assert load_credentials("aaa888") == {"password": "original"}

        # Now set a different key via env var and reset fernet
        new_key = Fernet.generate_key()
        monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", new_key.decode())
        monkeypatch.setattr("api.services.credential_store._fernet", None)

        # Old credentials can't be decrypted with the new key
        assert load_credentials("aaa888") is None

        # But new credentials work with the env var key
        store_credentials("aaa999", {"password": "new_key"})
        assert load_credentials("aaa999") == {"password": "new_key"}


class TestCredentialStoreKeyPersistence:
    """Encryption key survives across fernet reinitializations."""

    def test_key_persists_in_storage(self, monkeypatch):
        from api.services.credential_store import store_credentials, load_credentials

        # Store with auto-generated key
        store_credentials("bbb111", {"password": "persist_test"})

        # Reset fernet (simulates server restart)
        monkeypatch.setattr("api.services.credential_store._fernet", None)

        # Should still decrypt because key is in storage
        loaded = load_credentials("bbb111")
        assert loaded == {"password": "persist_test"}
