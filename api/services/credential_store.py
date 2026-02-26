"""
Credential store: encrypted storage for database connection credentials.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
- Encryption key is auto-generated on first use and stored at data/credentials/.key
- Encrypted credential files are stored at data/credentials/{connection_id}.enc
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_CREDENTIALS_DIR = Path(__file__).parent.parent.parent / "data" / "credentials"
_SAFE_ID_RE = re.compile(r"^[a-f0-9]{1,32}$")

# Lazily-initialized Fernet instance (reset in tests via monkeypatch)
_fernet: Fernet | None = None


def _validate_id(connection_id: str) -> None:
    """Validate connection_id to prevent path traversal. Raises ValueError if invalid."""
    if not _SAFE_ID_RE.match(connection_id):
        raise ValueError(f"Invalid connection_id: {connection_id!r}")


def _get_fernet() -> Fernet:
    """Return (and lazily create) the Fernet instance backed by a persistent key."""
    global _fernet
    if _fernet is not None:
        return _fernet

    _CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    key_path = _CREDENTIALS_DIR / ".key"

    if key_path.exists():
        key = key_path.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        # Restrict key file permissions (owner-only read/write)
        try:
            key_path.chmod(0o600)
        except OSError:
            pass  # Windows or other OS may not support chmod

    _fernet = Fernet(key)
    return _fernet


def store_credentials(connection_id: str, credentials: dict) -> None:
    """Encrypt and persist credentials for a connection."""
    _validate_id(connection_id)
    f = _get_fernet()
    plaintext = json.dumps(credentials).encode("utf-8")
    encrypted = f.encrypt(plaintext)

    _CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    enc_path = _CREDENTIALS_DIR / f"{connection_id}.enc"
    enc_path.write_bytes(encrypted)
    try:
        enc_path.chmod(0o600)
    except OSError:
        pass  # Windows or other OS may not support chmod
    logger.info("Stored encrypted credentials for connection %s", connection_id)


def load_credentials(connection_id: str) -> dict | None:
    """Load and decrypt credentials for a connection. Returns None if not found."""
    _validate_id(connection_id)
    enc_path = _CREDENTIALS_DIR / f"{connection_id}.enc"
    if not enc_path.exists():
        return None

    f = _get_fernet()
    encrypted = enc_path.read_bytes()
    try:
        plaintext = f.decrypt(encrypted)
        return json.loads(plaintext.decode("utf-8"))
    except Exception:
        logger.warning("Failed to decrypt credentials for connection %s", connection_id)
        return None


def delete_credentials(connection_id: str) -> None:
    """Delete stored credentials for a connection. No-op if not found."""
    _validate_id(connection_id)
    enc_path = _CREDENTIALS_DIR / f"{connection_id}.enc"
    if enc_path.exists():
        enc_path.unlink()
        logger.info("Deleted credentials for connection %s", connection_id)
