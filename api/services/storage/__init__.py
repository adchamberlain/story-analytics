"""Storage backend abstraction layer."""

from api.services.storage.base import StorageBackend
from api.services.storage.local import LocalStorageBackend
from api.services.storage.factory import get_storage

__all__ = ["StorageBackend", "LocalStorageBackend", "get_storage"]
