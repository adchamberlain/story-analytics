"""
Tests for S3StorageBackend — all using mocked boto3.

Covers: read (success + not found), write, delete (success + not found),
exists (true + false), list (with results + empty), copy, rename (copy + delete),
delete_tree, and get_local_path raises NotImplementedError.
"""

from unittest.mock import MagicMock, patch

import pytest


# We patch boto3 at the module level so S3StorageBackend never makes real AWS calls.
@pytest.fixture()
def s3_backend():
    """Create an S3StorageBackend with a fully mocked boto3 client."""
    with patch("boto3.client") as mock_boto:
        mock_client = MagicMock()
        mock_boto.return_value = mock_client

        from api.services.storage.s3 import S3StorageBackend

        backend = S3StorageBackend(bucket="test-bucket", region="us-east-1")
        # Expose mock for assertions
        backend._mock_client = mock_client
        yield backend


# ── Read ─────────────────────────────────────────────────────────────


class TestRead:
    def test_read_success(self, s3_backend):
        """read() returns the object body as bytes."""
        body_mock = MagicMock()
        body_mock.read.return_value = b"hello world"
        s3_backend._mock_client.get_object.return_value = {"Body": body_mock}

        result = s3_backend.read("charts/a.json")

        s3_backend._mock_client.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/a.json"
        )
        assert result == b"hello world"

    def test_read_not_found(self, s3_backend):
        """read() raises FileNotFoundError when the key does not exist."""
        from botocore.exceptions import ClientError

        error_response = {"Error": {"Code": "NoSuchKey", "Message": "Not found"}}
        s3_backend._mock_client.get_object.side_effect = ClientError(
            error_response, "GetObject"
        )

        with pytest.raises(FileNotFoundError, match="charts/missing.json"):
            s3_backend.read("charts/missing.json")

    def test_read_not_found_404(self, s3_backend):
        """read() raises FileNotFoundError on a 404 error code too."""
        from botocore.exceptions import ClientError

        error_response = {"Error": {"Code": "404", "Message": "Not found"}}
        s3_backend._mock_client.get_object.side_effect = ClientError(
            error_response, "GetObject"
        )

        with pytest.raises(FileNotFoundError):
            s3_backend.read("charts/gone.json")


# ── Write ────────────────────────────────────────────────────────────


class TestWrite:
    def test_write(self, s3_backend):
        """write() calls put_object with the correct bucket, key, and body."""
        s3_backend.write("charts/new.json", b'{"type":"bar"}')

        s3_backend._mock_client.put_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/new.json", Body=b'{"type":"bar"}'
        )


# ── Delete ───────────────────────────────────────────────────────────


class TestDelete:
    def test_delete_success(self, s3_backend):
        """delete() calls head_object then delete_object."""
        s3_backend._mock_client.head_object.return_value = {}

        s3_backend.delete("charts/old.json")

        s3_backend._mock_client.head_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/old.json"
        )
        s3_backend._mock_client.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/old.json"
        )

    def test_delete_not_found(self, s3_backend):
        """delete() raises FileNotFoundError when key doesn't exist."""
        from botocore.exceptions import ClientError

        error_response = {"Error": {"Code": "404", "Message": "Not found"}}
        s3_backend._mock_client.head_object.side_effect = ClientError(
            error_response, "HeadObject"
        )

        with pytest.raises(FileNotFoundError, match="charts/ghost.json"):
            s3_backend.delete("charts/ghost.json")


# ── Exists ───────────────────────────────────────────────────────────


class TestExists:
    def test_exists_true(self, s3_backend):
        """exists() returns True when head_object succeeds."""
        s3_backend._mock_client.head_object.return_value = {}

        assert s3_backend.exists("charts/a.json") is True

    def test_exists_false(self, s3_backend):
        """exists() returns False when head_object raises ClientError."""
        from botocore.exceptions import ClientError

        error_response = {"Error": {"Code": "404", "Message": "Not found"}}
        s3_backend._mock_client.head_object.side_effect = ClientError(
            error_response, "HeadObject"
        )

        assert s3_backend.exists("charts/missing.json") is False


# ── List ─────────────────────────────────────────────────────────────


class TestList:
    def test_list_with_results(self, s3_backend):
        """list() uses paginator and returns all keys matching the prefix."""
        mock_paginator = MagicMock()
        s3_backend._mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {"Contents": [{"Key": "charts/a.json"}, {"Key": "charts/b.json"}]},
            {"Contents": [{"Key": "charts/sub/c.json"}]},
        ]

        result = s3_backend.list("charts")

        s3_backend._mock_client.get_paginator.assert_called_once_with(
            "list_objects_v2"
        )
        mock_paginator.paginate.assert_called_once_with(
            Bucket="test-bucket", Prefix="charts"
        )
        assert result == ["charts/a.json", "charts/b.json", "charts/sub/c.json"]

    def test_list_empty(self, s3_backend):
        """list() returns an empty list when no objects match."""
        mock_paginator = MagicMock()
        s3_backend._mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {}  # No "Contents" key
        ]

        result = s3_backend.list("empty-prefix")

        assert result == []


# ── Copy ─────────────────────────────────────────────────────────────


class TestCopy:
    def test_copy(self, s3_backend):
        """copy() calls copy_object within the same bucket."""
        s3_backend.copy("charts/orig.json", "charts/dup.json")

        s3_backend._mock_client.copy_object.assert_called_once_with(
            Bucket="test-bucket",
            CopySource={"Bucket": "test-bucket", "Key": "charts/orig.json"},
            Key="charts/dup.json",
        )


# ── Rename ───────────────────────────────────────────────────────────


class TestRename:
    def test_rename(self, s3_backend):
        """rename() copies then deletes the source (head_object + delete_object)."""
        # head_object must succeed for the delete step
        s3_backend._mock_client.head_object.return_value = {}

        s3_backend.rename("charts/old.json", "charts/new.json")

        # copy_object was called
        s3_backend._mock_client.copy_object.assert_called_once_with(
            Bucket="test-bucket",
            CopySource={"Bucket": "test-bucket", "Key": "charts/old.json"},
            Key="charts/new.json",
        )
        # Then delete (head_object + delete_object)
        s3_backend._mock_client.head_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/old.json"
        )
        s3_backend._mock_client.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="charts/old.json"
        )


# ── Delete tree ──────────────────────────────────────────────────────


class TestDeleteTree:
    def test_delete_tree(self, s3_backend):
        """delete_tree() lists all keys with prefix, then batch-deletes them."""
        mock_paginator = MagicMock()
        s3_backend._mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {"Contents": [{"Key": "dir/a.txt"}, {"Key": "dir/b.txt"}]},
            {"Contents": [{"Key": "dir/sub/c.txt"}]},
        ]

        s3_backend.delete_tree("dir")

        s3_backend._mock_client.delete_objects.assert_called_once_with(
            Bucket="test-bucket",
            Delete={
                "Objects": [
                    {"Key": "dir/a.txt"},
                    {"Key": "dir/b.txt"},
                    {"Key": "dir/sub/c.txt"},
                ]
            },
        )

    def test_delete_tree_empty_is_noop(self, s3_backend):
        """delete_tree() does nothing when there are no objects to delete."""
        mock_paginator = MagicMock()
        s3_backend._mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [{}]

        s3_backend.delete_tree("nonexistent")

        s3_backend._mock_client.delete_objects.assert_not_called()

    def test_delete_tree_batches_over_1000(self, s3_backend):
        """delete_tree() splits into batches of 1000 for large key sets."""
        keys = [{"Key": f"dir/file-{i}.txt"} for i in range(2500)]
        mock_paginator = MagicMock()
        s3_backend._mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [{"Contents": keys}]

        s3_backend.delete_tree("dir")

        # Should have 3 calls: 1000 + 1000 + 500
        assert s3_backend._mock_client.delete_objects.call_count == 3
        calls = s3_backend._mock_client.delete_objects.call_args_list
        assert len(calls[0][1]["Delete"]["Objects"]) == 1000
        assert len(calls[1][1]["Delete"]["Objects"]) == 1000
        assert len(calls[2][1]["Delete"]["Objects"]) == 500


# ── get_local_path ───────────────────────────────────────────────────


class TestGetLocalPath:
    def test_downloads_to_local_cache(self, s3_backend):
        """get_local_path() downloads from S3 to a local temp file."""
        body_mock = MagicMock()
        body_mock.read.return_value = b"a,b\n1,2\n"
        s3_backend._mock_client.get_object.return_value = {"Body": body_mock}

        local = s3_backend.get_local_path("uploads/abc123/data.csv")
        assert local.exists()
        assert local.read_bytes() == b"a,b\n1,2\n"
        # Cleanup
        local.unlink(missing_ok=True)
