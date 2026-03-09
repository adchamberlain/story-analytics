"""
Tests for kernel_manager service.

These tests spawn real Jupyter kernel processes and may take 30-60s total.
Run with: pytest api/tests/test_kernel_manager.py -v --timeout=120
"""

import time

import pytest

from api.services.kernel_manager import KernelManager, KernelSession


@pytest.fixture
def km():
    """Create a fresh KernelManager and shut down all kernels after the test."""
    manager = KernelManager(idle_timeout_seconds=5)
    yield manager
    manager.shutdown_all()


class TestStartKernel:
    def test_start_kernel_returns_session(self, km):
        session = km.start_kernel("nb-001")
        assert isinstance(session, KernelSession)
        assert session.notebook_id == "nb-001"

    def test_kernel_is_alive(self, km):
        session = km.start_kernel("nb-002")
        assert session.is_alive() is True


class TestGetKernel:
    def test_get_existing_returns_same_instance(self, km):
        session = km.start_kernel("nb-003")
        retrieved = km.get_kernel("nb-003")
        assert retrieved is session

    def test_get_nonexistent_returns_none(self, km):
        assert km.get_kernel("does-not-exist") is None


class TestExecute:
    def test_stdout_output(self, km):
        session = km.start_kernel("nb-exec-1")
        result = session.execute("print('hello world')")
        assert result["status"] == "ok"
        stdout_outputs = [
            o for o in result["outputs"]
            if o["output_type"] == "stream" and o["name"] == "stdout"
        ]
        assert len(stdout_outputs) >= 1
        assert "hello world" in stdout_outputs[0]["text"]

    def test_execute_result(self, km):
        session = km.start_kernel("nb-exec-2")
        result = session.execute("2 + 3")
        assert result["status"] == "ok"
        exec_results = [
            o for o in result["outputs"]
            if o["output_type"] == "execute_result"
        ]
        assert len(exec_results) == 1
        assert "5" in exec_results[0]["data"].get("text/plain", "")
        assert result["execution_count"] is not None

    def test_error_output(self, km):
        session = km.start_kernel("nb-exec-3")
        result = session.execute("1 / 0")
        assert result["status"] == "error"
        error_outputs = [
            o for o in result["outputs"]
            if o["output_type"] == "error"
        ]
        assert len(error_outputs) == 1
        assert error_outputs[0]["ename"] == "ZeroDivisionError"


class TestShutdown:
    def test_shutdown_removes_kernel(self, km):
        km.start_kernel("nb-shutdown")
        km.shutdown_kernel("nb-shutdown")
        assert km.get_kernel("nb-shutdown") is None

    def test_shutdown_nonexistent_is_noop(self, km):
        # Should not raise
        km.shutdown_kernel("nonexistent")


class TestRestart:
    def test_restart_clears_variables(self, km):
        session = km.start_kernel("nb-restart")
        session.execute("my_var = 42")

        # Verify variable exists
        result = session.execute("print(my_var)")
        assert result["status"] == "ok"

        # Restart
        new_session = km.restart_kernel("nb-restart")
        assert new_session is not None
        assert new_session.is_alive()

        # Variable should be gone
        result = new_session.execute("print(my_var)")
        assert result["status"] == "error"

    def test_restart_nonexistent_returns_none(self, km):
        assert km.restart_kernel("nonexistent") is None


class TestDataFrames:
    def test_get_dataframes(self, km):
        session = km.start_kernel("nb-df-1")
        session.execute("import pandas as pd")
        session.execute("df = pd.DataFrame({'a': [1,2,3], 'b': [4,5,6]})")

        dfs = session.get_dataframes()
        assert "df" in dfs
        assert dfs["df"]["rows"] == 3
        assert dfs["df"]["columns"] == ["a", "b"]

    def test_get_dataframes_empty(self, km):
        session = km.start_kernel("nb-df-2")
        dfs = session.get_dataframes()
        assert dfs == {}

    def test_get_dataframe_csv(self, km):
        session = km.start_kernel("nb-df-3")
        session.execute("import pandas as pd")
        session.execute("sales = pd.DataFrame({'x': [1,2], 'y': [3,4]})")

        csv = session.get_dataframe_csv("sales")
        assert csv is not None
        assert "x,y" in csv
        assert "1,3" in csv

    def test_get_dataframe_csv_not_found(self, km):
        session = km.start_kernel("nb-df-4")
        assert session.get_dataframe_csv("nonexistent") is None


class TestCleanupIdle:
    def test_cleanup_idle_removes_old_sessions(self, km):
        session = km.start_kernel("nb-idle")
        # Backdate the last_activity
        session.last_activity = time.time() - 10
        cleaned = km.cleanup_idle()
        assert "nb-idle" in cleaned
        assert km.get_kernel("nb-idle") is None

    def test_cleanup_idle_keeps_active_sessions(self, km):
        km.start_kernel("nb-active")
        cleaned = km.cleanup_idle()
        assert "nb-active" not in cleaned
        assert km.get_kernel("nb-active") is not None


class TestSingleton:
    def test_get_kernel_manager_returns_same_instance(self):
        from api.services.kernel_manager import get_kernel_manager
        km1 = get_kernel_manager()
        km2 = get_kernel_manager()
        assert km1 is km2
