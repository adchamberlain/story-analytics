"""
Shared fixtures for the Story Analytics regression test suite.

Uses the same storage-isolation strategy as api/tests/conftest.py:
redirect the _storage backend to a temp directory so no test data
leaks into the real data/ directory.
"""

import os
import pytest


@pytest.fixture(autouse=True)
def _isolate_storage(monkeypatch, tmp_path):
    """Redirect ALL storage to a temp directory for every test.

    The services use a _storage abstraction (not module-level DIR constants),
    so we must replace the _storage object on each service module and reset
    the DuckDB singleton.
    """
    import api.services.storage.factory as factory
    import api.services.chart_storage as chart_storage
    import api.services.dashboard_storage as dashboard_storage
    import api.services.connection_service as connection_service
    import api.services.settings_storage as settings_storage
    import api.services.folder_storage as folder_storage
    import api.services.version_storage as version_storage
    import api.services.theme_storage as theme_storage
    import api.services.data_cache as data_cache
    import api.services.template_storage as template_storage
    import api.services.notebook_storage as notebook_storage
    import api.services.duckdb_service as duckdb_svc

    data_dir = tmp_path / "data"
    data_dir.mkdir()

    monkeypatch.setenv("STORAGE_LOCAL_DIR", str(data_dir))

    # Clear the singleton cache so get_storage() picks up the new env var
    factory.get_storage.cache_clear()
    new_storage = factory.get_storage()

    # Replace _storage on all service modules
    modules_with_storage = [
        chart_storage, dashboard_storage, connection_service, settings_storage,
        folder_storage, version_storage, theme_storage, data_cache,
        template_storage, notebook_storage,
    ]
    for mod in modules_with_storage:
        if hasattr(mod, "_storage"):
            monkeypatch.setattr(mod, "_storage", new_storage)

    # Reset the DuckDBService singleton so it gets fresh storage
    if hasattr(duckdb_svc, "_service"):
        monkeypatch.setattr(duckdb_svc, "_service", None)

    # Also patch legacy DATA_DIR if it still exists
    if hasattr(duckdb_svc, "DATA_DIR"):
        uploads = tmp_path / "uploads"
        uploads.mkdir()
        monkeypatch.setattr(duckdb_svc, "DATA_DIR", uploads)

    yield

    # Clear the cache again so real storage is restored
    factory.get_storage.cache_clear()


@pytest.fixture()
def tmp_data_dir(tmp_path):
    """Returns the isolated data directory.

    Storage is already isolated by the autouse _isolate_storage fixture.
    Returns tmp_path/data so that tests checking file paths (e.g.
    tmp_data_dir / "charts" / "xxx.json") find the right location.
    """
    return tmp_path / "data"


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
