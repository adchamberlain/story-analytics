"""
StorageBackend abstract base class.

Defines the contract for all storage implementations (local filesystem, S3, etc.).
"""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Abstract interface for file storage operations."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """Read a file and return its contents as bytes.

        Raises:
            FileNotFoundError: If the file does not exist.
        """

    @abstractmethod
    def write(self, path: str, data: bytes) -> None:
        """Write data to a file atomically, creating parent directories as needed."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete a file.

        Raises:
            FileNotFoundError: If the file does not exist.
        """

    @abstractmethod
    def list(self, prefix: str) -> list[str]:
        """List all files under a prefix. Returns relative paths."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check whether a file exists."""

    @abstractmethod
    def copy(self, src: str, dst: str) -> None:
        """Copy a file from src to dst.

        Raises:
            FileNotFoundError: If src does not exist.
        """

    @abstractmethod
    def rename(self, src: str, dst: str) -> None:
        """Rename (move) a file from src to dst.

        Raises:
            FileNotFoundError: If src does not exist.
        """

    @abstractmethod
    def delete_tree(self, prefix: str) -> None:
        """Delete all files under a prefix (like rm -rf). No-op if prefix doesn't exist."""

    # ── Convenience helpers (non-abstract) ──────────────────────────

    def read_text(self, path: str) -> str:
        """Read a file and return its contents as a UTF-8 string."""
        return self.read(path).decode("utf-8")

    def write_text(self, path: str, text: str) -> None:
        """Write a UTF-8 string to a file."""
        self.write(path, text.encode("utf-8"))
