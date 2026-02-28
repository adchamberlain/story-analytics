"""
Credential store: encrypted storage for database connection credentials.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
- Encryption key priority: CREDENTIAL_ENCRYPTION_KEY env var > stored key > generate new
- Encrypted credential files are stored at credentials/{connection_id}.enc
- All storage goes through the storage abstraction (local filesystem or S3)
"""
from __future__ import annotations

import json
import logging
import os
import re

from cryptography.fernet import Fernet

from api.services.storage import get_storage

logger = logging.getLogger(__name__)

_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")

# Lazily-initialized Fernet instance (reset in tests via monkeypatch)
_fernet: Fernet | None = None


def _validate_id(connection_id: str) -> None:
    """Validate connection_id to prevent path traversal. Raises ValueError if invalid."""
    if not _SAFE_ID_RE.match(connection_id):
        raise ValueError(f"Invalid connection_id: {connection_id!r}")


def _get_fernet() -> Fernet:
    """Return (and lazily create) the Fernet instance backed by a persistent key.

    Key resolution order:
    1. CREDENTIAL_ENCRYPTION_KEY env var (base64-encoded Fernet key)
    2. Stored key at credentials/.key in the storage backend
    3. Generate a new key and store it
    """
    global _fernet
    if _fernet is not None:
        return _fernet

    storage = get_storage()

    # 1. Check env var
    env_key = os.environ.get("CREDENTIAL_ENCRYPTION_KEY")
    if env_key:
        _fernet = Fernet(env_key.encode("utf-8") if isinstance(env_key, str) else env_key)
        return _fernet

    # 2. Check stored key
    key_path = "credentials/.key"
    try:
        key = storage.read(key_path).strip()
    except FileNotFoundError:
        # 3. Generate and store new key
        key = Fernet.generate_key()
        storage.write(key_path, key)
        logger.info("Generated new credential encryption key")

    _fernet = Fernet(key)
    return _fernet


def store_credentials(connection_id: str, credentials: dict) -> None:
    """Encrypt and persist credentials for a connection."""
    _validate_id(connection_id)
    f = _get_fernet()
    plaintext = json.dumps(credentials).encode("utf-8")
    encrypted = f.encrypt(plaintext)

    storage = get_storage()
    storage.write(f"credentials/{connection_id}.enc", encrypted)
    logger.info("Stored encrypted credentials for connection %s", connection_id)


def load_credentials(connection_id: str) -> dict | None:
    """Load and decrypt credentials for a connection. Returns None if not found."""
    _validate_id(connection_id)
    storage = get_storage()

    try:
        encrypted = storage.read(f"credentials/{connection_id}.enc")
    except FileNotFoundError:
        return None

    f = _get_fernet()
    try:
        plaintext = f.decrypt(encrypted)
        return json.loads(plaintext.decode("utf-8"))
    except Exception:
        logger.warning("Failed to decrypt credentials for connection %s", connection_id)
        return None


def delete_credentials(connection_id: str) -> None:
    """Delete stored credentials for a connection. No-op if not found."""
    _validate_id(connection_id)
    storage = get_storage()
    try:
        storage.delete(f"credentials/{connection_id}.enc")
        logger.info("Deleted credentials for connection %s", connection_id)
    except FileNotFoundError:
        pass
