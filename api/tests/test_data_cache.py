"""Tests for the file-based data cache with TTL and staleness tracking."""

import json
from datetime import datetime, timezone, timedelta

import pytest

from api.services.data_cache import (
    _cache_key,
    get_cached,
    set_cached,
    get_staleness,
)


@pytest.fixture(autouse=True)
def clean_cache(tmp_path, monkeypatch):
    """Use a temp directory for cache and clean up after each test."""
    test_cache = tmp_path / "cache"
    test_cache.mkdir()
    monkeypatch.setattr("api.services.data_cache.CACHE_DIR", test_cache)
    yield test_cache


class TestCacheMiss:
    def test_cache_miss_returns_none(self):
        """Uncached URL returns None."""
        result = get_cached("https://example.com/data.csv")
        assert result is None


class TestCacheSetAndGet:
    def test_cache_set_and_get(self):
        """Store then retrieve data from cache."""
        url = "https://example.com/data.csv"
        data = b"col1,col2\na,1\nb,2"

        set_cached(url, data)
        result = get_cached(url, ttl_seconds=300)

        assert result is not None
        assert result["data"] == data
        assert result["age_seconds"] >= 0
        assert result["fetched_at"] is not None

    def test_cache_set_with_etag(self):
        """Cache stores and returns etag."""
        url = "https://example.com/data.csv"
        data = b"col1,col2\na,1"

        set_cached(url, data, etag="abc123")
        result = get_cached(url, ttl_seconds=300)

        assert result is not None
        assert result["etag"] == "abc123"


class TestCacheExpiry:
    def test_cache_expiry(self, clean_cache):
        """Data older than TTL returns None."""
        url = "https://example.com/stale.csv"
        data = b"col1\nval"

        set_cached(url, data)

        # Manually backdate the metadata to make it stale
        key = _cache_key(url)
        meta_path = clean_cache / f"{key}.meta.json"
        meta = json.loads(meta_path.read_text())
        old_time = (datetime.now(timezone.utc) - timedelta(seconds=600)).isoformat()
        meta["fetched_at"] = old_time
        meta_path.write_text(json.dumps(meta))

        # TTL of 300s means 600s-old data should be stale
        result = get_cached(url, ttl_seconds=300)
        assert result is None


class TestDifferentUrls:
    def test_cache_different_urls(self):
        """Different URLs get different cache entries."""
        url_a = "https://example.com/a.csv"
        url_b = "https://example.com/b.csv"

        set_cached(url_a, b"data_a")
        set_cached(url_b, b"data_b")

        result_a = get_cached(url_a, ttl_seconds=300)
        result_b = get_cached(url_b, ttl_seconds=300)

        assert result_a is not None
        assert result_b is not None
        assert result_a["data"] == b"data_a"
        assert result_b["data"] == b"data_b"


class TestCacheKeyHeaders:
    def test_cache_key_includes_headers(self):
        """Different headers produce different cache keys."""
        url = "https://example.com/api/data"

        key_no_headers = _cache_key(url)
        key_with_auth = _cache_key(url, {"Authorization": "Bearer token123"})
        key_with_other = _cache_key(url, {"Authorization": "Bearer other"})

        assert key_no_headers != key_with_auth
        assert key_with_auth != key_with_other

    def test_cache_with_different_headers(self):
        """Same URL with different headers caches separately."""
        url = "https://example.com/api/data"
        headers_a = {"Authorization": "Bearer a"}
        headers_b = {"Authorization": "Bearer b"}

        set_cached(url, b"data_for_a", headers=headers_a)
        set_cached(url, b"data_for_b", headers=headers_b)

        result_a = get_cached(url, headers=headers_a, ttl_seconds=300)
        result_b = get_cached(url, headers=headers_b, ttl_seconds=300)

        assert result_a["data"] == b"data_for_a"
        assert result_b["data"] == b"data_for_b"


class TestStaleness:
    def test_staleness_none_for_uncached(self):
        """No staleness for uncached URLs."""
        result = get_staleness("https://example.com/uncached.csv")
        assert result is None

    def test_staleness_returns_age(self, clean_cache):
        """Age increases after caching."""
        url = "https://example.com/aged.csv"
        set_cached(url, b"data")

        age = get_staleness(url)
        assert age is not None
        assert age >= 0

        # Backdate to verify age calculation
        key = _cache_key(url)
        meta_path = clean_cache / f"{key}.meta.json"
        meta = json.loads(meta_path.read_text())
        old_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        meta["fetched_at"] = old_time
        meta_path.write_text(json.dumps(meta))

        age = get_staleness(url)
        assert age is not None
        assert age >= 119  # Allow 1s tolerance
