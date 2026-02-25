# Self-Hosted Cloud Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable one-command deployment of Story Analytics to a user's own AWS account (App Runner + S3 + RDS Postgres).

**Architecture:** Storage abstraction layer (local/S3), database abstraction (SQLite/Postgres), single production Docker image, CloudFormation template, CLI deploy command.

**Tech Stack:** boto3, aiobotocore, psycopg2-binary, SQLAlchemy (text queries), AWS CloudFormation, App Runner, S3, RDS Postgres.

---

## Phase 1: Storage Abstraction Layer

### Task 1: Create StorageBackend ABC and LocalStorageBackend

**Files:**
- Create: `api/services/storage/__init__.py`
- Create: `api/services/storage/base.py`
- Create: `api/services/storage/local.py`
- Create: `api/services/storage/factory.py`
- Test: `api/tests/test_storage_backend.py`

**Step 1: Write failing tests for StorageBackend interface**

```python
# api/tests/test_storage_backend.py
import pytest
import os
import tempfile
from api.services.storage.local import LocalStorageBackend

@pytest.fixture
def storage(tmp_path):
    return LocalStorageBackend(base_dir=str(tmp_path))

def test_write_and_read(storage):
    storage.write("charts/abc123.json", b'{"title": "test"}')
    data = storage.read("charts/abc123.json")
    assert data == b'{"title": "test"}'

def test_read_nonexistent_raises(storage):
    with pytest.raises(FileNotFoundError):
        storage.read("charts/nonexistent.json")

def test_exists(storage):
    assert not storage.exists("charts/abc123.json")
    storage.write("charts/abc123.json", b"{}")
    assert storage.exists("charts/abc123.json")

def test_delete(storage):
    storage.write("charts/abc123.json", b"{}")
    storage.delete("charts/abc123.json")
    assert not storage.exists("charts/abc123.json")

def test_delete_nonexistent_raises(storage):
    with pytest.raises(FileNotFoundError):
        storage.delete("charts/nonexistent.json")

def test_list_prefix(storage):
    storage.write("charts/aaa.json", b"{}")
    storage.write("charts/bbb.json", b"{}")
    storage.write("dashboards/ccc.json", b"{}")
    result = storage.list("charts/")
    assert sorted(result) == ["charts/aaa.json", "charts/bbb.json"]

def test_list_empty_prefix(storage):
    result = storage.list("charts/")
    assert result == []

def test_write_creates_subdirectories(storage):
    storage.write("versions/chart1/v001.json", b"{}")
    assert storage.exists("versions/chart1/v001.json")

def test_atomic_write_doesnt_corrupt_on_content(storage):
    """Write should be atomic — partial writes don't leave corrupt files."""
    storage.write("charts/abc.json", b'{"v": 1}')
    storage.write("charts/abc.json", b'{"v": 2}')
    assert storage.read("charts/abc.json") == b'{"v": 2}'

def test_copy_file(storage):
    storage.write("uploads/src1/data.csv", b"a,b\n1,2")
    storage.copy("uploads/src1/data.csv", "uploads/src2/data.csv")
    assert storage.read("uploads/src2/data.csv") == b"a,b\n1,2"

def test_rename(storage):
    storage.write("uploads/src1/old.csv", b"a,b\n1,2")
    storage.rename("uploads/src1/old.csv", "uploads/src1/new.csv")
    assert storage.exists("uploads/src1/new.csv")
    assert not storage.exists("uploads/src1/old.csv")

def test_delete_tree(storage):
    storage.write("uploads/src1/a.csv", b"a")
    storage.write("uploads/src1/b.csv", b"b")
    storage.delete_tree("uploads/src1/")
    assert not storage.exists("uploads/src1/a.csv")
    assert not storage.exists("uploads/src1/b.csv")
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/andrewchamberlain/github/story-analytics && python -m pytest api/tests/test_storage_backend.py -v`
Expected: FAIL — modules don't exist yet

**Step 3: Implement the ABC and LocalStorageBackend**

```python
# api/services/storage/__init__.py
from .base import StorageBackend
from .factory import get_storage

__all__ = ["StorageBackend", "get_storage"]
```

```python
# api/services/storage/base.py
from abc import ABC, abstractmethod

class StorageBackend(ABC):
    """Abstract storage backend for all file-based data."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """Read a file. Raises FileNotFoundError if not found."""
        ...

    @abstractmethod
    def write(self, path: str, data: bytes) -> None:
        """Write a file atomically. Creates parent dirs as needed."""
        ...

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete a file. Raises FileNotFoundError if not found."""
        ...

    @abstractmethod
    def list(self, prefix: str) -> list[str]:
        """List all files under a prefix. Returns relative paths."""
        ...

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if a file exists."""
        ...

    @abstractmethod
    def copy(self, src: str, dst: str) -> None:
        """Copy a file from src to dst."""
        ...

    @abstractmethod
    def rename(self, src: str, dst: str) -> None:
        """Rename/move a file from src to dst."""
        ...

    @abstractmethod
    def delete_tree(self, prefix: str) -> None:
        """Delete all files under a prefix (like rm -rf)."""
        ...

    def read_text(self, path: str) -> str:
        """Convenience: read as UTF-8 string."""
        return self.read(path).decode("utf-8")

    def write_text(self, path: str, text: str) -> None:
        """Convenience: write a UTF-8 string."""
        self.write(path, text.encode("utf-8"))
```

```python
# api/services/storage/local.py
import os
import shutil
import tempfile
from pathlib import Path
from .base import StorageBackend

class LocalStorageBackend(StorageBackend):
    """File-system storage backend (default for local mode)."""

    def __init__(self, base_dir: str = "data"):
        self._base = Path(base_dir)

    def _resolve(self, path: str) -> Path:
        return self._base / path

    def read(self, path: str) -> bytes:
        p = self._resolve(path)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return p.read_bytes()

    def write(self, path: str, data: bytes) -> None:
        p = self._resolve(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write: temp file + rename
        fd, tmp_name = tempfile.mkstemp(dir=p.parent, suffix=".tmp")
        try:
            os.write(fd, data)
            os.close(fd)
            os.replace(tmp_name, str(p))
        except Exception:
            os.close(fd) if not os.get_inheritable(fd) else None
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
            raise

    def delete(self, path: str) -> None:
        p = self._resolve(path)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {path}")
        p.unlink()

    def list(self, prefix: str) -> list[str]:
        p = self._resolve(prefix)
        if not p.exists():
            return []
        results = []
        for f in p.iterdir():
            if f.is_file():
                results.append(str(f.relative_to(self._base)))
        return results

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    def copy(self, src: str, dst: str) -> None:
        s = self._resolve(src)
        d = self._resolve(dst)
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(s), str(d))

    def rename(self, src: str, dst: str) -> None:
        s = self._resolve(src)
        d = self._resolve(dst)
        d.parent.mkdir(parents=True, exist_ok=True)
        s.rename(d)

    def delete_tree(self, prefix: str) -> None:
        p = self._resolve(prefix)
        if p.exists():
            shutil.rmtree(str(p))

    def get_local_path(self, path: str) -> Path:
        """Local-only: return the actual filesystem path.
        Used by DuckDB which needs real file paths for read_csv_auto().
        Raises NotImplementedError on non-local backends.
        """
        return self._resolve(path)
```

```python
# api/services/storage/factory.py
import os
from functools import lru_cache
from .base import StorageBackend
from .local import LocalStorageBackend

@lru_cache(maxsize=1)
def get_storage() -> StorageBackend:
    """Return the configured storage backend (singleton)."""
    backend = os.environ.get("STORAGE_BACKEND", "local")
    if backend == "s3":
        from .s3 import S3StorageBackend
        bucket = os.environ["S3_BUCKET"]
        return S3StorageBackend(bucket=bucket)
    return LocalStorageBackend(base_dir="data")
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/andrewchamberlain/github/story-analytics && python -m pytest api/tests/test_storage_backend.py -v`
Expected: All 13 tests PASS

**Step 5: Commit**

```bash
git add api/services/storage/ api/tests/test_storage_backend.py
git commit -m "feat: add StorageBackend ABC and LocalStorageBackend"
```

---

### Task 2: Create S3StorageBackend

**Files:**
- Create: `api/services/storage/s3.py`
- Test: `api/tests/test_s3_storage.py`

**Step 1: Write S3StorageBackend tests (mocked)**

```python
# api/tests/test_s3_storage.py
import pytest
from unittest.mock import MagicMock, patch, call
from botocore.exceptions import ClientError
from api.services.storage.s3 import S3StorageBackend

@pytest.fixture
def mock_s3():
    with patch("api.services.storage.s3.boto3") as mock_boto:
        client = MagicMock()
        mock_boto.client.return_value = client
        backend = S3StorageBackend(bucket="test-bucket")
        yield backend, client

def test_read(mock_s3):
    backend, client = mock_s3
    body = MagicMock()
    body.read.return_value = b'{"title": "test"}'
    client.get_object.return_value = {"Body": body}
    result = backend.read("charts/abc123.json")
    assert result == b'{"title": "test"}'
    client.get_object.assert_called_once_with(Bucket="test-bucket", Key="charts/abc123.json")

def test_read_not_found(mock_s3):
    backend, client = mock_s3
    error = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    client.get_object.side_effect = error
    with pytest.raises(FileNotFoundError):
        backend.read("charts/missing.json")

def test_write(mock_s3):
    backend, client = mock_s3
    backend.write("charts/abc.json", b'{"v": 1}')
    client.put_object.assert_called_once_with(
        Bucket="test-bucket", Key="charts/abc.json", Body=b'{"v": 1}'
    )

def test_delete(mock_s3):
    backend, client = mock_s3
    client.head_object.return_value = {}  # exists
    backend.delete("charts/abc.json")
    client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="charts/abc.json")

def test_exists_true(mock_s3):
    backend, client = mock_s3
    client.head_object.return_value = {}
    assert backend.exists("charts/abc.json") is True

def test_exists_false(mock_s3):
    backend, client = mock_s3
    error = ClientError({"Error": {"Code": "404"}}, "HeadObject")
    client.head_object.side_effect = error
    assert backend.exists("charts/abc.json") is False

def test_list(mock_s3):
    backend, client = mock_s3
    client.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": "charts/aaa.json"}, {"Key": "charts/bbb.json"}]}
    ]
    result = backend.list("charts/")
    assert sorted(result) == ["charts/aaa.json", "charts/bbb.json"]

def test_list_empty(mock_s3):
    backend, client = mock_s3
    client.get_paginator.return_value.paginate.return_value = [{}]
    assert backend.list("charts/") == []
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest api/tests/test_s3_storage.py -v`
Expected: FAIL — module doesn't exist

**Step 3: Implement S3StorageBackend**

```python
# api/services/storage/s3.py
import boto3
from botocore.exceptions import ClientError
from .base import StorageBackend

class S3StorageBackend(StorageBackend):
    """S3 storage backend for cloud mode."""

    def __init__(self, bucket: str, region: str | None = None):
        self._bucket = bucket
        kwargs = {}
        if region:
            kwargs["region_name"] = region
        self._client = boto3.client("s3", **kwargs)

    def read(self, path: str) -> bytes:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=path)
            return resp["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                raise FileNotFoundError(f"S3 key not found: {path}")
            raise

    def write(self, path: str, data: bytes) -> None:
        self._client.put_object(Bucket=self._bucket, Key=path, Body=data)

    def delete(self, path: str) -> None:
        if not self.exists(path):
            raise FileNotFoundError(f"S3 key not found: {path}")
        self._client.delete_object(Bucket=self._bucket, Key=path)

    def list(self, prefix: str) -> list[str]:
        results = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                results.append(obj["Key"])
        return results

    def exists(self, path: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=path)
            return True
        except ClientError:
            return False

    def copy(self, src: str, dst: str) -> None:
        self._client.copy_object(
            Bucket=self._bucket,
            CopySource={"Bucket": self._bucket, "Key": src},
            Key=dst,
        )

    def rename(self, src: str, dst: str) -> None:
        self.copy(src, dst)
        self._client.delete_object(Bucket=self._bucket, Key=src)

    def delete_tree(self, prefix: str) -> None:
        keys = self.list(prefix)
        if not keys:
            return
        # S3 delete_objects supports up to 1000 keys per call
        for i in range(0, len(keys), 1000):
            batch = [{"Key": k} for k in keys[i:i + 1000]]
            self._client.delete_objects(
                Bucket=self._bucket, Delete={"Objects": batch}
            )

    def get_local_path(self, path: str):
        raise NotImplementedError(
            "S3 backend does not support local file paths. "
            "Use read() to get file contents."
        )
```

**Step 4: Add boto3 to requirements.txt**

Add `boto3>=1.34.0` and `botocore>=1.34.0` to `requirements.txt`.

**Step 5: Run tests**

Run: `python -m pytest api/tests/test_s3_storage.py -v`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add api/services/storage/s3.py api/tests/test_s3_storage.py requirements.txt
git commit -m "feat: add S3StorageBackend for cloud mode"
```

---

### Task 3: Refactor chart_storage.py to use StorageBackend

This is the template for all other storage service refactors. Do this one carefully, then apply the pattern to the rest.

**Files:**
- Modify: `api/services/chart_storage.py`
- Verify: existing chart tests still pass

**Step 1: Read current chart_storage.py thoroughly**

Read: `api/services/chart_storage.py` — understand the full API surface.

**Step 2: Refactor to use StorageBackend**

Pattern to apply:
- Replace `Path("data/charts")` with `get_storage()` calls
- Replace `path.read_text()` with `storage.read_text()`
- Replace atomic write with `storage.write_text()`
- Replace `path.unlink()` with `storage.delete()`
- Replace `glob("*.json")` with `storage.list("charts/")`
- Replace `path.exists()` with `storage.exists()`

Key principle: The storage service's public API (save_chart, load_chart, list_charts, etc.) stays identical. Only the internal file I/O changes.

**Step 3: Run existing tests**

Run: `python -m pytest api/tests/ -v -k chart`
Expected: All existing chart tests PASS

**Step 4: Commit**

```bash
git add api/services/chart_storage.py
git commit -m "refactor: chart_storage uses StorageBackend abstraction"
```

---

### Task 4: Refactor remaining storage services

Apply the same pattern from Task 3 to all other storage services. These can be done in a single pass since they all follow the same structure.

**Files to modify (8 total):**
- `api/services/dashboard_storage.py` — same pattern as chart_storage
- `api/services/folder_storage.py` — same pattern
- `api/services/theme_storage.py` — same pattern
- `api/services/template_storage.py` — same pattern
- `api/services/connection_service.py` — same pattern
- `api/services/version_storage.py` — same pattern, plus nested dirs (`versions/{chart_id}/`)
- `api/services/settings_storage.py` — single file (`settings.json`)
- `api/services/data_cache.py` — paired files (`{key}.meta.json` + `{key}.data`)

**Step 1: Refactor each service file**

For each file, apply the same substitutions:
- `Path("data/X")` → `get_storage()` + `"X/"` prefix
- `path.read_text()` → `storage.read_text("X/filename.json")`
- Atomic write → `storage.write_text("X/filename.json", json.dumps(...))`
- `glob("*.json")` → `storage.list("X/")`
- `path.exists()` → `storage.exists("X/filename.json")`
- `path.unlink()` → `storage.delete("X/filename.json")`
- `shutil.rmtree()` → `storage.delete_tree("X/subdir/")`

**Step 2: Run full backend test suite**

Run: `python -m pytest api/tests/ -v`
Expected: All 200 backend tests PASS

**Step 3: Commit**

```bash
git add api/services/dashboard_storage.py api/services/folder_storage.py \
  api/services/theme_storage.py api/services/template_storage.py \
  api/services/connection_service.py api/services/version_storage.py \
  api/services/settings_storage.py api/services/data_cache.py
git commit -m "refactor: all storage services use StorageBackend abstraction"
```

---

### Task 5: Refactor upload/DuckDB file paths

This is the trickiest part. DuckDB needs real file paths to do `read_csv_auto()`. For local mode, `storage.get_local_path()` works. For S3 mode, we need to download the file to a temp path first.

**Files:**
- Modify: `api/services/duckdb_service.py`
- Modify: `api/routers/data.py`
- Modify: `api/routers/transforms.py`

**Step 1: Add a temp-file helper to StorageBackend**

Add to `api/services/storage/base.py`:
```python
import tempfile
from contextlib import contextmanager

class StorageBackend(ABC):
    # ... existing methods ...

    @contextmanager
    def as_local_path(self, path: str):
        """Yield a local filesystem path for tools that need one (e.g., DuckDB).
        For local backend: returns the actual path.
        For S3 backend: downloads to temp file, yields path, cleans up.
        """
        try:
            yield self.get_local_path(path)
        except NotImplementedError:
            data = self.read(path)
            suffix = "." + path.rsplit(".", 1)[-1] if "." in path else ""
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(data)
                tmp_path = f.name
            try:
                from pathlib import Path
                yield Path(tmp_path)
            finally:
                import os
                os.unlink(tmp_path)
```

**Step 2: Refactor duckdb_service.py**

Replace direct file path references with `storage.as_local_path()` context manager for DuckDB operations. Replace `shutil.copy2()` uploads with `storage.write()`.

**Step 3: Refactor data.py router**

Replace `shutil.rmtree()` calls with `storage.delete_tree()`. Replace temp file uploads with `storage.write()`.

**Step 4: Refactor transforms.py router**

Replace direct CSV read/write with storage-backed operations.

**Step 5: Run tests**

Run: `python -m pytest api/tests/ -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add api/services/duckdb_service.py api/routers/data.py api/routers/transforms.py \
  api/services/storage/base.py
git commit -m "refactor: upload/DuckDB paths use StorageBackend"
```

---

### Task 6: Refactor seed data loading

**Files:**
- Modify: `api/main.py` — `_seed_data_if_empty()` function

**Step 1: Update seed function to use StorageBackend**

Replace `shutil.copytree()` with reading from local seed directory and writing via storage backend.

**Step 2: Run app startup test**

Run: `python -m pytest api/tests/ -v`
Expected: PASS

**Step 3: Commit**

```bash
git add api/main.py
git commit -m "refactor: seed data loading uses StorageBackend"
```

---

## Phase 2: Database Abstraction

### Task 7: Create database connection abstraction

The current `metadata_db.py` uses raw `sqlite3` with `?` placeholders. Rather than converting 60+ queries to a different placeholder style, we'll create a thin wrapper that abstracts the connection and makes queries work with both SQLite and Postgres.

**Files:**
- Create: `api/services/db/__init__.py`
- Create: `api/services/db/connection.py`
- Test: `api/tests/test_db_connection.py`

**Step 1: Write tests for the DB wrapper**

```python
# api/tests/test_db_connection.py
import pytest
from api.services.db.connection import get_db, DatabaseConnection

def test_sqlite_connection():
    db = DatabaseConnection("sqlite:///:memory:")
    db.execute(
        "CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)"
    )
    db.execute("INSERT INTO test VALUES (?, ?)", ("1", "Alice"))
    row = db.fetchone("SELECT * FROM test WHERE id = ?", ("1",))
    assert row["id"] == "1"
    assert row["name"] == "Alice"

def test_sqlite_fetchall():
    db = DatabaseConnection("sqlite:///:memory:")
    db.execute("CREATE TABLE test (id TEXT, name TEXT)")
    db.execute("INSERT INTO test VALUES (?, ?)", ("1", "Alice"))
    db.execute("INSERT INTO test VALUES (?, ?)", ("2", "Bob"))
    rows = db.fetchall("SELECT * FROM test ORDER BY id")
    assert len(rows) == 2
    assert rows[0]["name"] == "Alice"

def test_sqlite_rowcount():
    db = DatabaseConnection("sqlite:///:memory:")
    db.execute("CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)")
    db.execute("INSERT INTO test VALUES (?, ?)", ("1", "Alice"))
    count = db.execute("DELETE FROM test WHERE id = ?", ("1",))
    assert count == 1

def test_sqlite_executescript():
    db = DatabaseConnection("sqlite:///:memory:")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS t1 (id TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS t2 (id TEXT PRIMARY KEY);
    """)
    # Should not raise
    db.execute("INSERT INTO t1 VALUES (?)", ("1",))
    db.execute("INSERT INTO t2 VALUES (?)", ("1",))
```

**Step 2: Implement DatabaseConnection**

```python
# api/services/db/connection.py
import os
import re
import sqlite3
from functools import lru_cache

class DatabaseConnection:
    """Thin wrapper that works with both SQLite and Postgres.

    Accepts queries with `?` placeholders (SQLite style).
    For Postgres, converts them to `%s` automatically.
    """

    def __init__(self, url: str | None = None):
        self._url = url or os.environ.get("DATABASE_URL", "sqlite:///data/metadata.db")
        self._is_postgres = self._url.startswith("postgresql")
        self._conn = None
        self._connect()

    def _connect(self):
        if self._is_postgres:
            import psycopg2
            import psycopg2.extras
            # Parse postgresql://user:pass@host/db
            self._conn = psycopg2.connect(self._url)
            self._conn.autocommit = False
        else:
            db_path = self._url.replace("sqlite:///", "")
            from pathlib import Path
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
            self._conn = sqlite3.connect(db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")

    def _convert_query(self, query: str) -> str:
        """Convert ? placeholders to %s for Postgres."""
        if self._is_postgres:
            return query.replace("?", "%s")
        return query

    def execute(self, query: str, params: tuple = ()) -> int:
        """Execute a query. Returns rowcount."""
        cursor = self._conn.cursor()
        cursor.execute(self._convert_query(query), params)
        self._conn.commit()
        return cursor.rowcount

    def fetchone(self, query: str, params: tuple = ()) -> dict | None:
        """Execute and return one row as dict, or None."""
        if self._is_postgres:
            import psycopg2.extras
            cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            cursor = self._conn.cursor()
        cursor.execute(self._convert_query(query), params)
        row = cursor.fetchone()
        if row is None:
            return None
        if self._is_postgres:
            return dict(row)
        return dict(row)  # sqlite3.Row supports dict()

    def fetchall(self, query: str, params: tuple = ()) -> list[dict]:
        """Execute and return all rows as list of dicts."""
        if self._is_postgres:
            import psycopg2.extras
            cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            cursor = self._conn.cursor()
        cursor.execute(self._convert_query(query), params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

    def executescript(self, script: str) -> None:
        """Execute a multi-statement SQL script."""
        if self._is_postgres:
            cursor = self._conn.cursor()
            cursor.execute(script)
            self._conn.commit()
        else:
            self._conn.executescript(script)

    def close(self):
        if self._conn:
            self._conn.close()

@lru_cache(maxsize=1)
def get_db() -> DatabaseConnection:
    """Return the configured database connection (singleton)."""
    return DatabaseConnection()
```

**Step 3: Run tests**

Run: `python -m pytest api/tests/test_db_connection.py -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add api/services/db/ api/tests/test_db_connection.py
git commit -m "feat: add DatabaseConnection wrapper for SQLite/Postgres"
```

---

### Task 8: Migrate metadata_db.py to use DatabaseConnection

**Files:**
- Modify: `api/services/metadata_db.py`

**Step 1: Replace sqlite3 usage with DatabaseConnection**

In `metadata_db.py`:
- Replace `_get_conn()` with `get_db()` from the new wrapper
- Remove `import sqlite3`
- Remove PRAGMA calls (handled by DatabaseConnection)
- Replace `conn.execute(query, params).fetchone()` with `db.fetchone(query, params)`
- Replace `conn.execute(query, params).fetchall()` with `db.fetchall(query, params)`
- Replace `cursor = conn.execute(...)` + `cursor.rowcount` with `count = db.execute(...)`
- Replace `conn.executescript(...)` with `db.executescript(...)`
- Remove all `conn.commit()` and `conn.close()` calls (handled by wrapper)
- Remove all `try/finally` blocks around connection management

**Step 2: Fix SQLite-specific DDL for Postgres compatibility**

In `_ensure_tables()`, the `CREATE TABLE IF NOT EXISTS` statements need:
- `AUTOINCREMENT` → remove (Postgres uses `SERIAL` but we use TEXT PKs, so N/A)
- `ON CONFLICT` in DDL → verify Postgres compatibility
- Verify all column types are compatible (TEXT, INTEGER — both work in Postgres)

**Step 3: Run full backend test suite**

Run: `python -m pytest api/tests/ -v`
Expected: All 200 tests PASS

**Step 4: Commit**

```bash
git add api/services/metadata_db.py
git commit -m "refactor: metadata_db uses DatabaseConnection for SQLite/Postgres"
```

---

### Task 9: Add psycopg2-binary to requirements and update config

**Files:**
- Modify: `requirements.txt`
- Modify: `api/config.py`
- Modify: `api/database.py`

**Step 1: Add psycopg2-binary**

Add `psycopg2-binary>=2.9.9` to `requirements.txt`.

**Step 2: Update config.py**

Ensure `DATABASE_URL` defaults to SQLite but can be overridden:
```python
database_url: str = os.environ.get("DATABASE_URL", "sqlite:///data/metadata.db")
```

**Step 3: Clean up database.py**

The SQLAlchemy setup in `database.py` should also respect the `DATABASE_URL` env var and not break on Postgres connection strings.

**Step 4: Run tests**

Run: `python -m pytest api/tests/ -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add requirements.txt api/config.py api/database.py
git commit -m "feat: add Postgres driver, update DB config for cloud mode"
```

---

## Phase 3: Production Docker Image

### Task 10: Create production Dockerfile

**Files:**
- Create: `Dockerfile` (root, replaces Dockerfile.api for production)

**Step 1: Write multi-stage Dockerfile**

```dockerfile
# Dockerfile
# Multi-stage build: React frontend + Python API in one image

# Stage 1: Build React frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY app/package*.json ./
RUN npm ci --production=false
COPY app/ ./
RUN npm run build

# Stage 2: Python API + built SPA
FROM python:3.11-slim
WORKDIR /app

# Install system deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY api/ ./api/
COPY engine/ ./engine/

# Copy built frontend
COPY --from=frontend /app/dist ./static/

# Copy seed data
COPY data/seed/ ./data/seed/

# Create data directory for local mode
RUN mkdir -p /app/data

ENV STORAGE_BACKEND=local
ENV DATABASE_URL=sqlite:///app/data/metadata.db

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: Build and verify locally**

Run: `docker build -t story-analytics:latest .`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add production multi-stage Dockerfile"
```

---

### Task 11: Add FastAPI static file serving for SPA

**Files:**
- Modify: `api/main.py`

**Step 1: Add static file mount and SPA catch-all**

Add to `api/main.py` after all router mounts:

```python
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve built React SPA (only in production when static/ exists)
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="static-assets")

    # Serve basemaps
    basemaps_dir = os.path.join(static_dir, "basemaps")
    if os.path.exists(basemaps_dir):
        app.mount("/basemaps", StaticFiles(directory=basemaps_dir), name="basemaps")

    # SPA catch-all: serve index.html for all non-API routes
    @app.get("/{path:path}")
    async def spa_catch_all(path: str):
        # If path matches a static file, serve it
        file_path = os.path.join(static_dir, path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise serve index.html (SPA routing)
        return FileResponse(os.path.join(static_dir, "index.html"))
```

**Step 2: Handle embed.html separately**

The embed route needs its own HTML entry point:
```python
    @app.get("/embed/{rest:path}")
    async def embed_catch_all(rest: str):
        embed_html = os.path.join(static_dir, "embed.html")
        if os.path.exists(embed_html):
            return FileResponse(embed_html)
        return FileResponse(os.path.join(static_dir, "index.html"))
```

Note: This catch-all MUST be mounted AFTER all API routers so `/api/*` routes take priority.

**Step 3: Test locally**

Build frontend: `cd app && npm run build`
Copy dist to static: `cp -r app/dist api/../static`
Run: `uvicorn api.main:app --port 8000`
Open: `http://localhost:8000` — should show the React app
Open: `http://localhost:8000/embed/chart/test` — should show embed page

**Step 4: Commit**

```bash
git add api/main.py
git commit -m "feat: FastAPI serves built React SPA in production"
```

---

## Phase 4: AWS Deployment Infrastructure

### Task 12: Create CloudFormation template

**Files:**
- Create: `deploy/cloudformation.yaml`

**Step 1: Write the CloudFormation template**

This template creates: VPC, subnets, security groups, RDS Postgres, S3 bucket, ECR repo, App Runner service with VPC connector, IAM roles.

Key resources:
- `AWS::EC2::VPC` + 2 private subnets (for RDS)
- `AWS::RDS::DBInstance` (db.t4g.micro, Postgres 16)
- `AWS::S3::Bucket` (private, versioned)
- `AWS::ECR::Repository`
- `AWS::AppRunner::VpcConnector`
- `AWS::AppRunner::Service`
- `AWS::IAM::Role` (App Runner access to S3 + ECR)

Parameters: `StackName`, `Region`, `DBPassword` (via Secrets Manager or parameter).

Outputs: `AppUrl`, `S3Bucket`, `ECRRepo`, `DBEndpoint`.

**Step 2: Validate template**

Run: `aws cloudformation validate-template --template-body file://deploy/cloudformation.yaml`
Expected: Valid

**Step 3: Commit**

```bash
git add deploy/cloudformation.yaml
git commit -m "feat: add CloudFormation template for AWS deployment"
```

---

### Task 13: Create CLI deploy script

**Files:**
- Create: `deploy/__init__.py`
- Create: `deploy/aws.py`
- Create: `deploy/cli.py`

**Step 1: Write the deploy script**

`deploy/aws.py` — core deployment logic using boto3:
- `validate_credentials()` — check AWS CLI is configured
- `build_and_push_image(region, repo_name)` — Docker build + ECR push
- `deploy_stack(stack_name, region, params)` — CloudFormation create/update
- `get_stack_outputs(stack_name, region)` — retrieve URL, bucket, etc.
- `destroy_stack(stack_name, region)` — delete CloudFormation stack

`deploy/cli.py` — CLI entry point:
```bash
python -m deploy.cli deploy --region us-east-1       # First deploy
python -m deploy.cli update --region us-east-1       # Update code
python -m deploy.cli destroy --region us-east-1      # Tear down
python -m deploy.cli status --region us-east-1       # Check status
```

**Step 2: Test deploy command (dry run)**

Run: `python -m deploy.cli deploy --region us-east-1 --dry-run`
Expected: Prints what would be created without actually deploying

**Step 3: Commit**

```bash
git add deploy/
git commit -m "feat: add CLI deploy command for AWS"
```

---

## Phase 5: Live Deployment Test

### Task 14: Deploy to Andrew's AWS account

**Step 1: Configure AWS credentials**

Ensure `~/.aws/credentials` has a profile with sufficient permissions (or use `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

**Step 2: Run deploy command**

```bash
python -m deploy.cli deploy --region us-east-1
```

**Step 3: Verify deployment**

- Open the App Runner URL in browser
- Create a chart, verify it saves
- Reload page, verify chart persists
- Test embed URL
- Check S3 bucket has chart JSON files
- Check RDS has metadata tables

**Step 4: Fix any issues discovered during live test**

Iterate on CloudFormation template and deploy script as needed.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: deployment fixes from live AWS test"
```

---

## Phase 6: Documentation

### Task 15: Write user-facing deployment guide

**Files:**
- Create: `docs/deploy-aws.md`

**Step 1: Write the guide**

Cover:
1. Prerequisites (AWS account, AWS CLI, Docker)
2. One-command deploy
3. Custom domain setup (optional)
4. Updating your deployment
5. Tearing down
6. Cost breakdown
7. Troubleshooting

**Step 2: Update README.md**

Add "Cloud Deployment" section with link to the guide.

**Step 3: Commit**

```bash
git add docs/deploy-aws.md README.md
git commit -m "docs: add AWS deployment guide"
```

---

## Task Dependency Graph

```
Task 1 (StorageBackend ABC) → Task 2 (S3Backend) → Task 3 (chart_storage) → Task 4 (remaining storage) → Task 5 (DuckDB/uploads) → Task 6 (seed data)
                                                                                                                                          ↓
Task 7 (DB wrapper) → Task 8 (metadata_db) → Task 9 (requirements/config) ──────────────────────────────────────────────────────────→ Task 10 (Dockerfile)
                                                                                                                                          ↓
                                                                                                                                    Task 11 (SPA serving)
                                                                                                                                          ↓
                                                                                                                                    Task 12 (CloudFormation)
                                                                                                                                          ↓
                                                                                                                                    Task 13 (CLI deploy)
                                                                                                                                          ↓
                                                                                                                                    Task 14 (Live test)
                                                                                                                                          ↓
                                                                                                                                    Task 15 (Docs)
```

Note: Phase 1 (Tasks 1-6) and Phase 2 (Tasks 7-9) can be executed **in parallel** since they modify different files. Tasks 10+ depend on both phases completing.

## Estimated Scope

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| 1. Storage abstraction | 1-6 | Largest — touches 10+ service files |
| 2. Database abstraction | 7-9 | Medium — one file (metadata_db.py) + wrapper |
| 3. Docker image | 10-11 | Small — Dockerfile + SPA serving |
| 4. AWS infrastructure | 12-13 | Medium — CloudFormation + CLI |
| 5. Live test | 14 | Variable — depends on issues found |
| 6. Docs | 15 | Small |
