"""
Shared fixtures for the Story Analytics regression test suite.
"""

import json
import shutil
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolate_uploads(monkeypatch, tmp_path):
    """Prevent ALL tests from writing CSV files to the real data/uploads directory.

    DuckDBService uses the module-level DATA_DIR constant for storing ingested CSVs.
    Without this fixture, every test that creates a DuckDBService() pollutes the real
    uploads directory with test files (sales.csv, test_limit.csv, etc.).
    """
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    import api.services.duckdb_service as ddb
    if hasattr(ddb, "DATA_DIR"):
        monkeypatch.setattr(ddb, "DATA_DIR", uploads)


@pytest.fixture()
def tmp_data_dir(monkeypatch, tmp_path):
    """Redirect chart, dashboard, and connection storage to a temp directory
    so tests never touch real data."""
    charts_dir = tmp_path / "charts"
    charts_dir.mkdir()
    dashboards_dir = tmp_path / "dashboards"
    dashboards_dir.mkdir()
    connections_dir = tmp_path / "connections"
    connections_dir.mkdir()

    import api.services.chart_storage as cs
    import api.services.dashboard_storage as ds
    import api.services.connection_service as conn_svc
    import api.services.metadata_db as meta_db

    if hasattr(cs, "CHARTS_DIR"):
        monkeypatch.setattr(cs, "CHARTS_DIR", charts_dir)
    if hasattr(ds, "DASHBOARDS_DIR"):
        monkeypatch.setattr(ds, "DASHBOARDS_DIR", dashboards_dir)
    if hasattr(conn_svc, "CONNECTIONS_DIR"):
        monkeypatch.setattr(conn_svc, "CONNECTIONS_DIR", connections_dir)
    if hasattr(meta_db, "DB_PATH"):
        monkeypatch.setattr(meta_db, "DB_PATH", tmp_path / "metadata.db")

    # Ensure default user exists in the temp DB for sharing tests
    meta_db.ensure_default_user()

    return tmp_path


@pytest.fixture()
def sample_chart_kwargs():
    """Minimal kwargs for save_chart()."""
    return dict(
        source_id="test_src_001",
        chart_type="BarChart",
        title="Revenue by Region",
        sql='SELECT region, SUM(revenue) AS revenue FROM src_test_src_001 GROUP BY region',
        x="region",
        y="revenue",
        series=None,
        horizontal=False,
        sort=True,
        subtitle="Q1 2026",
        source="test.csv",
        reasoning="Bar chart is ideal for categorical comparison.",
        config={"color": "#3b82f6"},
    )


@pytest.fixture()
def sample_dashboard_kwargs():
    """Minimal kwargs for save_dashboard()."""
    return dict(
        title="Sales Dashboard",
        description="Overview of Q1 sales metrics",
    )
