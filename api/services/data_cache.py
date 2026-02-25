"""
Simple file-based data cache with TTL and staleness tracking.
Stores cached data source responses via StorageBackend with metadata.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone

from api.services.storage import get_storage

logger = logging.getLogger(__name__)

_storage = get_storage()


def _cache_key(url: str, headers: dict | None = None) -> str:
    """Generate a cache key from URL and optional headers."""
    key_parts = url
    if headers:
        key_parts += json.dumps(sorted(headers.items()))
    return hashlib.sha256(key_parts.encode()).hexdigest()[:16]


def get_cached(url: str, headers: dict | None = None, ttl_seconds: int = 300) -> dict | None:
    """Get cached response if fresh. Returns None if cache miss or stale.

    Returns dict with keys: data (bytes), fetched_at (ISO str), etag (str|None), age_seconds (int)
    """
    key = _cache_key(url, headers)
    meta_key = f"cache/{key}.meta.json"
    data_key = f"cache/{key}.data"

    if not _storage.exists(meta_key) or not _storage.exists(data_key):
        return None

    try:
        meta = json.loads(_storage.read_text(meta_key))
        fetched_at = datetime.fromisoformat(meta["fetched_at"])
        age = (datetime.now(timezone.utc) - fetched_at).total_seconds()

        if age > ttl_seconds:
            return None  # Stale

        return {
            "data": _storage.read(data_key),
            "fetched_at": meta["fetched_at"],
            "etag": meta.get("etag"),
            "age_seconds": int(age),
        }
    except Exception:
        logger.warning("Cache read error for key %s", key)
        return None


def set_cached(url: str, data: bytes, headers: dict | None = None, etag: str | None = None):
    """Store data in cache."""
    key = _cache_key(url, headers)

    meta = {
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "etag": etag,
    }

    meta_key = f"cache/{key}.meta.json"
    data_key = f"cache/{key}.data"

    # Write data (binary) then metadata (text)
    _storage.write(data_key, data)
    _storage.write_text(meta_key, json.dumps(meta, indent=2))


def get_staleness(url: str, headers: dict | None = None) -> int | None:
    """Get age of cached data in seconds. None if not cached."""
    key = _cache_key(url, headers)
    meta_key = f"cache/{key}.meta.json"

    if not _storage.exists(meta_key):
        return None

    try:
        meta = json.loads(_storage.read_text(meta_key))
        fetched_at = datetime.fromisoformat(meta["fetched_at"])
        return int((datetime.now(timezone.utc) - fetched_at).total_seconds())
    except Exception:
        return None
