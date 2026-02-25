"""
S3StorageBackend — AWS S3-backed storage.

All paths are treated as S3 keys within a single bucket.
Uses boto3 for all operations.
"""

import boto3
from botocore.exceptions import ClientError

from api.services.storage.base import StorageBackend


class S3StorageBackend(StorageBackend):
    """Store files in an AWS S3 bucket."""

    def __init__(self, bucket: str, region: str | None = None) -> None:
        self._bucket = bucket
        self._client = boto3.client("s3", region_name=region)

    # ── Public API ──────────────────────────────────────────────────

    def read(self, path: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=path)
            return response["Body"].read()
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("NoSuchKey", "404"):
                raise FileNotFoundError(f"File not found in S3: {path}") from exc
            raise

    def write(self, path: str, data: bytes) -> None:
        self._client.put_object(Bucket=self._bucket, Key=path, Body=data)

    def delete(self, path: str) -> None:
        try:
            self._client.head_object(Bucket=self._bucket, Key=path)
        except ClientError:
            raise FileNotFoundError(f"File not found in S3: {path}")
        self._client.delete_object(Bucket=self._bucket, Key=path)

    def list(self, prefix: str) -> list[str]:
        paginator = self._client.get_paginator("list_objects_v2")
        keys: list[str] = []
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

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
        self.delete(src)

    def delete_tree(self, prefix: str) -> None:
        keys = self.list(prefix)
        if not keys:
            return
        # S3 delete_objects supports max 1000 keys per call
        for i in range(0, len(keys), 1000):
            batch = keys[i : i + 1000]
            self._client.delete_objects(
                Bucket=self._bucket,
                Delete={"Objects": [{"Key": k} for k in batch]},
            )

    # get_local_path() inherits from StorageBackend base which raises
    # NotImplementedError — no override needed.
