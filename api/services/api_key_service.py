"""API key generation and validation service."""

import secrets
import hashlib

PREFIX = "sa_live_"


def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key.

    Returns: (full_key, key_hash, key_prefix)
    - full_key: The complete key to show to the user ONCE (sa_live_<32 random chars>)
    - key_hash: SHA-256 hash for storage
    - key_prefix: First 8 chars of the random part for identification
    """
    random_part = secrets.token_urlsafe(32)
    full_key = f"{PREFIX}{random_part}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = f"sa_live_{random_part[:8]}"
    return full_key, key_hash, key_prefix


def verify_api_key(full_key: str, stored_hash: str) -> bool:
    """Verify an API key against its stored hash."""
    computed_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return secrets.compare_digest(computed_hash, stored_hash)
