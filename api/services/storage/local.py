"""
LocalStorageBackend — filesystem-backed storage.

All paths are resolved relative to a configurable base directory.
Writes are atomic (tempfile + os.replace) to prevent corruption.
"""

import os
import shutil
import tempfile
from pathlib import Path

from api.services.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    """Store files on the local filesystem under a base directory."""

    def __init__(self, base_dir: str = "data") -> None:
        self._base_dir = os.path.abspath(base_dir)

    def _resolve(self, path: str) -> Path:
        """Resolve a relative path against the base directory."""
        resolved = (Path(self._base_dir) / path).resolve()
        base = Path(self._base_dir).resolve()
        if not (str(resolved) + os.sep).startswith(str(base) + os.sep) and resolved != base:
            raise ValueError(f"Path escapes base directory: {path!r}")
        return resolved

    # ── Public API ──────────────────────────────────────────────────

    def read(self, path: str) -> bytes:
        full = self._resolve(path)
        if not full.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return full.read_bytes()

    def write(self, path: str, data: bytes) -> None:
        full = self._resolve(path)
        full.parent.mkdir(parents=True, exist_ok=True)

        # Atomic write: write to a temp file in the same directory, then rename.
        fd, tmp_name = tempfile.mkstemp(dir=str(full.parent), suffix=".tmp")
        fd_closed = False
        try:
            os.write(fd, data)
            os.close(fd)
            fd_closed = True
            os.replace(tmp_name, str(full))
        except BaseException:
            if not fd_closed:
                try:
                    os.close(fd)
                except OSError:
                    pass
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    def delete(self, path: str) -> None:
        full = self._resolve(path)
        if not full.exists():
            raise FileNotFoundError(f"File not found: {path}")
        full.unlink()

    def list(self, prefix: str) -> list[str]:
        root = self._resolve(prefix)
        if not root.exists():
            return []
        base = Path(self._base_dir)
        return sorted(
            str(p.relative_to(base))
            for p in root.rglob("*")
            if p.is_file()
        )

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    def copy(self, src: str, dst: str) -> None:
        src_full = self._resolve(src)
        if not src_full.exists():
            raise FileNotFoundError(f"File not found: {src}")
        dst_full = self._resolve(dst)
        dst_full.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src_full), str(dst_full))

    def rename(self, src: str, dst: str) -> None:
        src_full = self._resolve(src)
        if not src_full.exists():
            raise FileNotFoundError(f"File not found: {src}")
        dst_full = self._resolve(dst)
        dst_full.parent.mkdir(parents=True, exist_ok=True)
        src_full.rename(dst_full)

    def delete_tree(self, prefix: str) -> None:
        root = self._resolve(prefix)
        if root.exists():
            shutil.rmtree(str(root))

    # ── Local-only helpers ──────────────────────────────────────────

    def get_local_path(self, path: str) -> Path:
        """Return the absolute filesystem path. Used by DuckDB for direct file access."""
        return self._resolve(path)
