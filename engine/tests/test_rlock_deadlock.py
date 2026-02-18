"""
Regression test: DuckDB service uses RLock (reentrant) instead of Lock.

Bug: ingest_csv's BaseException cleanup tried to re-acquire a non-reentrant
Lock that was still held, causing a permanent deadlock on MemoryError / signals.
Fix: Changed threading.Lock() to threading.RLock() so the same thread can
re-acquire the lock inside except/finally handlers.
"""

import threading

import pytest

from api.services.duckdb_service import DuckDBService


@pytest.mark.unit
class TestRLockNotLock:
    def test_lock_is_reentrant(self):
        """The service's lock must be an RLock so cleanup handlers don't deadlock."""
        svc = DuckDBService()
        assert isinstance(svc._lock, type(threading.RLock())), (
            "Expected RLock (reentrant), got non-reentrant Lock — "
            "will deadlock on BaseException during ingest_csv"
        )

    def test_reentrant_acquire_does_not_deadlock(self):
        """Simulates the BaseException cleanup path: re-acquire inside a held lock."""
        svc = DuckDBService()
        with svc._lock:
            # This second acquire must succeed immediately (RLock), not deadlock (Lock)
            acquired = svc._lock.acquire(timeout=1)
            assert acquired, "Lock re-acquire timed out — this is a deadlock"
            svc._lock.release()
