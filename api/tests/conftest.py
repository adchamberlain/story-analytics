"""
Shared test fixtures for api/tests.

Prevents ALL tests from writing to real data directories by redirecting
the storage backend and credential store to temporary directories.
"""

import os
import tempfile
import shutil
from pathlib import Path


# Create a session-wide temp directory for all test data
_session_tmp: Path | None = None
_original_env: dict[str, str | None] = {}
_original_attrs: list[tuple] = []


def _setup_isolation():
    """Redirect all storage to a temp directory for the entire test session."""
    global _session_tmp

    _session_tmp = Path(tempfile.mkdtemp(prefix="story_analytics_test_")).resolve()

    import api.services.storage.factory as factory
    import api.services.credential_store as cred_store
    import api.routers.connections as conn_router
    import api.services.chart_storage as chart_storage
    import api.services.dashboard_storage as dashboard_storage
    import api.services.connection_service as connection_service
    import api.services.settings_storage as settings_storage
    import api.services.folder_storage as folder_storage
    import api.services.version_storage as version_storage
    import api.services.theme_storage as theme_storage
    import api.services.data_cache as data_cache
    import api.services.template_storage as template_storage
    import api.services.duckdb_service as duckdb_svc

    # Save originals for cleanup
    data_dir = _session_tmp / "data"
    data_dir.mkdir()

    _original_env["STORAGE_LOCAL_DIR"] = os.environ.get("STORAGE_LOCAL_DIR")
    os.environ["STORAGE_LOCAL_DIR"] = str(data_dir)

    # Clear the singleton cache so get_storage() picks up the new env var
    factory.get_storage.cache_clear()
    new_storage = factory.get_storage()

    # Replace module-level _storage references in all services
    modules_with_storage = [
        chart_storage, dashboard_storage, connection_service, settings_storage,
        folder_storage, version_storage, theme_storage, data_cache, template_storage,
    ]
    for mod in modules_with_storage:
        _original_attrs.append((mod, "_storage", getattr(mod, "_storage")))
        mod._storage = new_storage

    # Reset the DuckDBService singleton so it gets fresh storage
    _original_attrs.append((duckdb_svc, "_service", getattr(duckdb_svc, "_service")))
    duckdb_svc._service = None

    # Redirect credential store
    cred_dir = _session_tmp / "credentials"
    cred_dir.mkdir()
    _original_attrs.append((cred_store, "_CREDENTIALS_DIR", cred_store._CREDENTIALS_DIR))
    cred_store._CREDENTIALS_DIR = cred_dir
    _original_attrs.append((cred_store, "_fernet", cred_store._fernet))
    cred_store._fernet = None

    # Redirect schema cache
    cache_dir = _session_tmp / "schema_cache"
    cache_dir.mkdir()
    _original_attrs.append((conn_router, "_SCHEMA_CACHE_DIR", conn_router._SCHEMA_CACHE_DIR))
    conn_router._SCHEMA_CACHE_DIR = cache_dir


def _teardown_isolation():
    """Restore original storage and clean up temp directory."""
    import api.services.storage.factory as factory

    # Restore all original attributes
    for mod, attr, original in reversed(_original_attrs):
        setattr(mod, attr, original)
    _original_attrs.clear()

    # Restore env var
    orig = _original_env.get("STORAGE_LOCAL_DIR")
    if orig is None:
        os.environ.pop("STORAGE_LOCAL_DIR", None)
    else:
        os.environ["STORAGE_LOCAL_DIR"] = orig

    # Clear the cache so real storage is used again
    factory.get_storage.cache_clear()

    # Remove temp directory
    if _session_tmp and _session_tmp.exists():
        shutil.rmtree(_session_tmp, ignore_errors=True)


def pytest_configure(config):
    """Set up storage isolation before any tests run."""
    _setup_isolation()


def pytest_unconfigure(config):
    """Tear down storage isolation after all tests complete."""
    _teardown_isolation()
