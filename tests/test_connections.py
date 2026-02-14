#!/usr/bin/env python3
"""
Integration tests for the database connection pipeline.

Tests the full flow: create connection → sync cached parquet → use source_id
with existing chart proposal pipeline. All tests run offline (no Snowflake
credentials needed).

Usage:
    python tests/test_connections.py                  # Offline tests only
    python tests/test_connections.py --live            # Include live Snowflake tests
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


API_BASE = "http://localhost:8000/api"


# ── Result Tracking ──────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    passed: bool = False
    error: str = ""
    duration_s: float = 0.0


# ── Test Functions ───────────────────────────────────────────────────────────

def test_create_connection(client: httpx.Client) -> tuple[bool, str, str]:
    """POST /connections/ → 201, returns connection_id."""
    resp = client.post(
        f"{API_BASE}/connections/",
        json={
            "name": "Test Snowflake (Offline)",
            "db_type": "snowflake",
            "config": {
                "account": "test-account",
                "warehouse": "COMPUTE_WH",
                "database": "ANALYTICS_POC",
                "schema": "SAAS_DEMO",
            },
        },
        timeout=10,
    )
    if resp.status_code != 201:
        return False, f"Expected 201, got {resp.status_code}: {resp.text}", ""

    data = resp.json()
    conn_id = data.get("connection_id", "")
    if not conn_id:
        return False, "No connection_id in response", ""

    if data.get("name") != "Test Snowflake (Offline)":
        return False, f"Name mismatch: {data.get('name')}", conn_id

    return True, "", conn_id


def test_list_connections(client: httpx.Client, expected_id: str) -> tuple[bool, str]:
    """GET /connections/ → includes the created connection."""
    resp = client.get(f"{API_BASE}/connections/", timeout=10)
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}"

    connections = resp.json()
    ids = [c["connection_id"] for c in connections]
    if expected_id not in ids:
        return False, f"Connection {expected_id} not in list: {ids}"

    return True, ""


def test_get_connection(client: httpx.Client, conn_id: str) -> tuple[bool, str]:
    """GET /connections/{id} → returns correct connection."""
    resp = client.get(f"{API_BASE}/connections/{conn_id}", timeout=10)
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}"

    data = resp.json()
    if data["connection_id"] != conn_id:
        return False, f"ID mismatch: {data['connection_id']}"

    return True, ""


def test_sync_cached_parquet(client: httpx.Client, conn_id: str) -> tuple[bool, str, dict]:
    """POST /connections/{id}/sync (no credentials) → cached parquet fallback."""
    resp = client.post(
        f"{API_BASE}/connections/{conn_id}/sync",
        json={"tables": ["invoices"]},
        timeout=30,
    )
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}: {resp.text}", {}

    data = resp.json()
    sources = data.get("sources", [])
    if len(sources) == 0:
        return False, "No sources returned from sync", {}

    source_map = {s["table_name"]: s for s in sources}
    if "invoices" not in source_map:
        return False, f"'invoices' not in synced sources: {list(source_map.keys())}", {}

    inv = source_map["invoices"]
    if inv["row_count"] < 1:
        return False, f"invoices row_count is {inv['row_count']}, expected > 0", {}

    return True, "", source_map


def test_synced_source_has_schema(client: httpx.Client, source_id: str) -> tuple[bool, str]:
    """GET /data/schema/{source_id} → columns are present."""
    resp = client.get(f"{API_BASE}/data/schema/{source_id}", timeout=10)
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    if len(data.get("columns", [])) == 0:
        return False, "No columns in schema"

    col_names = [c["name"] for c in data["columns"]]
    if data.get("row_count", 0) < 1:
        return False, f"row_count is {data.get('row_count')}"

    return True, ""


def test_propose_from_synced_source(client: httpx.Client, source_id: str) -> tuple[bool, str]:
    """POST /v2/charts/propose with synced source_id → success."""
    resp = client.post(
        f"{API_BASE}/v2/charts/propose",
        json={
            "source_id": source_id,
            "user_hint": "show amount trend over time",
        },
        timeout=60,
    )
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    if not data.get("success"):
        return False, f"Proposal failed: {data.get('error')}"

    if not data.get("config", {}).get("chart_type"):
        return False, "No chart_type in proposal config"

    if not data.get("data"):
        return False, "No data returned from proposal"

    return True, ""


def test_save_chart_with_connection(
    client: httpx.Client,
    source_id: str,
    conn_id: str,
) -> tuple[bool, str]:
    """POST /v2/charts/save with connection_id and source_table → persisted."""
    # First get a proposal
    prop_resp = client.post(
        f"{API_BASE}/v2/charts/propose",
        json={"source_id": source_id, "user_hint": "bar chart of amounts by status"},
        timeout=60,
    )
    if prop_resp.status_code != 200:
        return False, f"Propose failed: {prop_resp.status_code}"

    proposal = prop_resp.json()
    if not proposal.get("success"):
        return False, f"Propose not successful: {proposal.get('error')}"

    config = proposal["config"]
    save_resp = client.post(
        f"{API_BASE}/v2/charts/save",
        json={
            "source_id": source_id,
            "chart_type": config["chart_type"],
            "title": config.get("title", "Test"),
            "sql": proposal["sql"],
            "x": config.get("x"),
            "y": config.get("y"),
            "series": config.get("series"),
            "connection_id": conn_id,
            "source_table": "invoices",
        },
        timeout=30,
    )
    if save_resp.status_code != 200:
        return False, f"Save failed: {save_resp.status_code}: {save_resp.text}"

    saved = save_resp.json()
    if saved.get("connection_id") != conn_id:
        return False, f"connection_id not persisted: {saved.get('connection_id')}"
    if saved.get("source_table") != "invoices":
        return False, f"source_table not persisted: {saved.get('source_table')}"

    return True, ""


def test_delete_connection(client: httpx.Client, conn_id: str) -> tuple[bool, str]:
    """DELETE /connections/{id} → 200."""
    resp = client.delete(f"{API_BASE}/connections/{conn_id}", timeout=10)
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}"

    # Verify it's gone
    resp2 = client.get(f"{API_BASE}/connections/{conn_id}", timeout=10)
    if resp2.status_code != 404:
        return False, f"Connection still exists after delete (got {resp2.status_code})"

    return True, ""


# ── Live Snowflake Tests (optional) ─────────────────────────────────────────

def test_live_snowflake_test(client: httpx.Client, conn_id: str) -> tuple[bool, str]:
    """POST /connections/{id}/test → success (requires credentials)."""
    resp = client.post(
        f"{API_BASE}/connections/{conn_id}/test",
        json={},  # Use .env credentials
        timeout=30,
    )
    if resp.status_code == 400:
        return False, "No credentials available"
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    if not data.get("success"):
        return False, f"Connection test failed: {data.get('message')}"

    return True, ""


def test_live_snowflake_tables(client: httpx.Client, conn_id: str) -> tuple[bool, str]:
    """POST /connections/{id}/tables → table list."""
    resp = client.post(
        f"{API_BASE}/connections/{conn_id}/tables",
        json={},
        timeout=30,
    )
    if resp.status_code == 400:
        return False, "No credentials available"
    if resp.status_code != 200:
        return False, f"Expected 200, got {resp.status_code}: {resp.text}"

    data = resp.json()
    tables = data.get("tables", [])
    if len(tables) == 0:
        return False, "No tables returned"

    return True, ""


# ── Runner ───────────────────────────────────────────────────────────────────

def run_tests(live: bool = False) -> list[TestResult]:
    results: list[TestResult] = []

    print(f"\n{'='*60}")
    print(f"  Connection Pipeline Tests {'(+ live)' if live else '(offline)'}")
    print(f"{'='*60}\n")

    with httpx.Client() as client:
        # 1. Create connection
        r = TestResult("create_connection")
        t0 = time.time()
        passed, error, conn_id = test_create_connection(client)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        if not conn_id:
            print("\nAborting — no connection_id to continue.\n")
            return results

        # 2. List connections
        r = TestResult("list_connections")
        t0 = time.time()
        passed, error = test_list_connections(client, conn_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # 3. Get connection
        r = TestResult("get_connection")
        t0 = time.time()
        passed, error = test_get_connection(client, conn_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # 4. Sync cached parquet
        r = TestResult("sync_cached_parquet")
        t0 = time.time()
        passed, error, source_map = test_sync_cached_parquet(client, conn_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        if not source_map:
            print("\nAborting — sync failed, no source_ids.\n")
            _cleanup(client, conn_id)
            return results

        inv_source_id = source_map["invoices"]["source_id"]
        print(f"  → invoices source_id: {inv_source_id}")
        print(f"  → invoices rows: {source_map['invoices']['row_count']}")

        # 5. Schema check
        r = TestResult("synced_source_has_schema")
        t0 = time.time()
        passed, error = test_synced_source_has_schema(client, inv_source_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # 6. Propose chart from synced source
        r = TestResult("propose_from_synced_source")
        t0 = time.time()
        passed, error = test_propose_from_synced_source(client, inv_source_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # 7. Save chart with connection_id
        r = TestResult("save_chart_with_connection")
        t0 = time.time()
        passed, error = test_save_chart_with_connection(client, inv_source_id, conn_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # 8. Delete connection
        r = TestResult("delete_connection")
        t0 = time.time()
        passed, error = test_delete_connection(client, conn_id)
        r.passed, r.error, r.duration_s = passed, error, time.time() - t0
        results.append(r)
        _print_result(r)

        # Live Snowflake tests (optional)
        if live:
            print(f"\n--- Live Snowflake Tests ---\n")

            # Create a fresh connection for live tests
            _, _, live_conn_id = test_create_connection(client)
            if live_conn_id:
                r = TestResult("live_snowflake_test")
                t0 = time.time()
                passed, error = test_live_snowflake_test(client, live_conn_id)
                r.passed, r.error, r.duration_s = passed, error, time.time() - t0
                results.append(r)
                _print_result(r)

                r = TestResult("live_snowflake_tables")
                t0 = time.time()
                passed, error = test_live_snowflake_tables(client, live_conn_id)
                r.passed, r.error, r.duration_s = passed, error, time.time() - t0
                results.append(r)
                _print_result(r)

                _cleanup(client, live_conn_id)

    return results


def _print_result(r: TestResult) -> None:
    status = "PASS" if r.passed else "FAIL"
    msg = f"  [{status}] {r.name} ({r.duration_s:.1f}s)"
    if r.error:
        msg += f" — {r.error[:100]}"
    print(msg)


def _cleanup(client: httpx.Client, conn_id: str) -> None:
    """Best-effort cleanup."""
    try:
        client.delete(f"{API_BASE}/connections/{conn_id}", timeout=5)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Connection pipeline tests")
    parser.add_argument("--live", action="store_true", help="Include live Snowflake tests")
    args = parser.parse_args()

    start = time.time()
    results = run_tests(live=args.live)
    elapsed = time.time() - start

    passed = sum(1 for r in results if r.passed)
    total = len(results)

    print(f"\n{'='*60}")
    print(f"  RESULT: {passed}/{total} passed ({elapsed:.1f}s)")
    print(f"{'='*60}\n")

    if passed < total:
        for r in results:
            if not r.passed:
                print(f"  FAIL: {r.name} — {r.error}")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
