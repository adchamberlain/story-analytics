"""
Storage factory — returns a singleton StorageBackend based on configuration.
"""

import os
from functools import lru_cache

from api.services.storage.base import StorageBackend


@lru_cache(maxsize=1)
def get_storage() -> StorageBackend:
    """Return the configured storage backend (singleton).

    Set STORAGE_BACKEND env var to choose:
        - "local" (default) → LocalStorageBackend
        - "s3" → S3StorageBackend (not yet implemented)
    """
    backend = os.environ.get("STORAGE_BACKEND", "local").lower()

    if backend == "local":
        from api.services.storage.local import LocalStorageBackend
        base_dir = os.environ.get("STORAGE_LOCAL_DIR", "data")
        return LocalStorageBackend(base_dir=base_dir)

    if backend == "s3":
        from api.services.storage.s3 import S3StorageBackend  # type: ignore[import-not-found]
        return S3StorageBackend()

    raise ValueError(f"Unknown STORAGE_BACKEND: {backend!r}. Use 'local' or 's3'.")
