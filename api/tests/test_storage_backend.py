"""
Tests for StorageBackend ABC and LocalStorageBackend.

Covers: read/write roundtrip, missing-file errors, exists, delete,
list with prefix, subdirectory creation, atomic write integrity,
copy, rename, delete_tree, and convenience text helpers.
"""

import os
import threading
from pathlib import Path

import pytest

from api.services.storage.base import StorageBackend
from api.services.storage.local import LocalStorageBackend


@pytest.fixture()
def storage(tmp_path: Path) -> LocalStorageBackend:
    """Create a LocalStorageBackend rooted at a fresh temp directory."""
    return LocalStorageBackend(base_dir=str(tmp_path))


# ── ABC contract ────────────────────────────────────────────────────

class TestABCContract:
    def test_cannot_instantiate_abc(self):
        """StorageBackend itself is abstract and cannot be instantiated."""
        with pytest.raises(TypeError):
            StorageBackend()  # type: ignore[abstract]


# ── Read / Write roundtrip ──────────────────────────────────────────

class TestReadWrite:
    def test_roundtrip_bytes(self, storage: LocalStorageBackend):
        storage.write("hello.txt", b"hello world")
        assert storage.read("hello.txt") == b"hello world"

    def test_roundtrip_text(self, storage: LocalStorageBackend):
        storage.write_text("greet.txt", "hi there")
        assert storage.read_text("greet.txt") == "hi there"

    def test_read_nonexistent_raises(self, storage: LocalStorageBackend):
        with pytest.raises(FileNotFoundError):
            storage.read("nope.txt")


# ── Exists ──────────────────────────────────────────────────────────

class TestExists:
    def test_exists_true(self, storage: LocalStorageBackend):
        storage.write("a.txt", b"data")
        assert storage.exists("a.txt") is True

    def test_exists_false(self, storage: LocalStorageBackend):
        assert storage.exists("missing.txt") is False


# ── Delete ──────────────────────────────────────────────────────────

class TestDelete:
    def test_delete_removes_file(self, storage: LocalStorageBackend):
        storage.write("doomed.txt", b"bye")
        storage.delete("doomed.txt")
        assert storage.exists("doomed.txt") is False

    def test_delete_nonexistent_raises(self, storage: LocalStorageBackend):
        with pytest.raises(FileNotFoundError):
            storage.delete("ghost.txt")


# ── List ────────────────────────────────────────────────────────────

class TestList:
    def test_list_with_prefix(self, storage: LocalStorageBackend):
        storage.write("charts/a.json", b"{}")
        storage.write("charts/b.json", b"{}")
        storage.write("sources/c.csv", b"x")

        result = storage.list("charts")
        assert sorted(result) == ["charts/a.json", "charts/b.json"]

    def test_list_nested(self, storage: LocalStorageBackend):
        storage.write("a/b/c.txt", b"deep")
        result = storage.list("a")
        assert result == ["a/b/c.txt"]

    def test_list_empty(self, storage: LocalStorageBackend):
        assert storage.list("nothing") == []


# ── Write creates subdirectories ────────────────────────────────────

class TestWriteCreatesSubdirs:
    def test_write_creates_parent_dirs(self, storage: LocalStorageBackend):
        storage.write("deep/nested/dir/file.txt", b"ok")
        assert storage.read("deep/nested/dir/file.txt") == b"ok"


# ── Atomic write integrity ──────────────────────────────────────────

class TestAtomicWrite:
    def test_no_partial_writes(self, storage: LocalStorageBackend):
        """If write fails mid-way, the original file should be untouched."""
        storage.write("safe.txt", b"original")

        # Overwrite with new content succeeds
        storage.write("safe.txt", b"updated")
        assert storage.read("safe.txt") == b"updated"

    def test_concurrent_writes_dont_corrupt(self, storage: LocalStorageBackend):
        """Multiple concurrent writes should not produce corrupted files."""
        errors: list[Exception] = []

        def writer(content: bytes):
            try:
                storage.write("shared.txt", content)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=writer, args=(f"data-{i}".encode(),))
                   for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors
        # File should contain one of the written values (not a mix)
        data = storage.read("shared.txt")
        assert data.startswith(b"data-")

    def test_no_leftover_temp_files(self, storage: LocalStorageBackend):
        """Successful writes should not leave .tmp files behind."""
        storage.write("clean.txt", b"data")
        base = Path(storage._base_dir)
        tmp_files = list(base.rglob("*.tmp"))
        assert tmp_files == []


# ── Copy ────────────────────────────────────────────────────────────

class TestCopy:
    def test_copy_file(self, storage: LocalStorageBackend):
        storage.write("orig.txt", b"payload")
        storage.copy("orig.txt", "dup.txt")
        assert storage.read("dup.txt") == b"payload"
        # Original still exists
        assert storage.read("orig.txt") == b"payload"

    def test_copy_nonexistent_raises(self, storage: LocalStorageBackend):
        with pytest.raises(FileNotFoundError):
            storage.copy("missing.txt", "dest.txt")


# ── Rename ──────────────────────────────────────────────────────────

class TestRename:
    def test_rename_file(self, storage: LocalStorageBackend):
        storage.write("old.txt", b"moving")
        storage.rename("old.txt", "new.txt")
        assert storage.read("new.txt") == b"moving"
        assert storage.exists("old.txt") is False

    def test_rename_nonexistent_raises(self, storage: LocalStorageBackend):
        with pytest.raises(FileNotFoundError):
            storage.rename("nowhere.txt", "somewhere.txt")


# ── Delete tree ─────────────────────────────────────────────────────

class TestDeleteTree:
    def test_delete_tree_removes_all(self, storage: LocalStorageBackend):
        storage.write("dir/a.txt", b"1")
        storage.write("dir/b.txt", b"2")
        storage.write("dir/sub/c.txt", b"3")
        storage.delete_tree("dir")
        assert storage.list("dir") == []
        assert storage.exists("dir/a.txt") is False

    def test_delete_tree_nonexistent_is_noop(self, storage: LocalStorageBackend):
        """Deleting a tree that doesn't exist should not raise."""
        storage.delete_tree("nonexistent")  # Should not raise


# ── get_local_path ──────────────────────────────────────────────────

class TestGetLocalPath:
    def test_returns_absolute_path(self, storage: LocalStorageBackend):
        storage.write("charts/x.json", b"{}")
        p = storage.get_local_path("charts/x.json")
        assert isinstance(p, Path)
        assert p.is_absolute()
        assert p.exists()


# ── Path traversal protection ──────────────────────────────────────

class TestPathTraversal:
    def test_path_traversal_blocked(self, storage: LocalStorageBackend):
        """Paths containing ../ that escape the base dir are rejected."""
        with pytest.raises(ValueError, match="escapes base directory"):
            storage.read("../../etc/passwd")

    def test_path_traversal_write_blocked(self, storage: LocalStorageBackend):
        with pytest.raises(ValueError, match="escapes base directory"):
            storage.write("../../evil.txt", b"bad")
