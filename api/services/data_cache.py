"""
Simple file-based data cache with TTL and staleness tracking.
Stores cached data source responses in data/cache/ with metadata.
"""

import hashlib
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"


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
    meta_path = CACHE_DIR / f"{key}.meta.json"
    data_path = CACHE_DIR / f"{key}.data"

    if not meta_path.exists() or not data_path.exists():
        return None

    try:
        meta = json.loads(meta_path.read_text())
        fetched_at = datetime.fromisoformat(meta["fetched_at"])
        age = (datetime.now(timezone.utc) - fetched_at).total_seconds()

        if age > ttl_seconds:
            return None  # Stale

        return {
            "data": data_path.read_bytes(),
            "fetched_at": meta["fetched_at"],
            "etag": meta.get("etag"),
            "age_seconds": int(age),
        }
    except Exception:
        logger.warning("Cache read error for key %s", key)
        return None


def set_cached(url: str, data: bytes, headers: dict | None = None, etag: str | None = None):
    """Store data in cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _cache_key(url, headers)

    meta = {
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "etag": etag,
    }

    meta_path = CACHE_DIR / f"{key}.meta.json"
    data_path = CACHE_DIR / f"{key}.data"

    # Write data then metadata
    data_path.write_bytes(data)
    meta_path.write_text(json.dumps(meta, indent=2))


def get_staleness(url: str, headers: dict | None = None) -> int | None:
    """Get age of cached data in seconds. None if not cached."""
    key = _cache_key(url, headers)
    meta_path = CACHE_DIR / f"{key}.meta.json"

    if not meta_path.exists():
        return None

    try:
        meta = json.loads(meta_path.read_text())
        fetched_at = datetime.fromisoformat(meta["fetched_at"])
        return int((datetime.now(timezone.utc) - fetched_at).total_seconds())
    except Exception:
        return None
