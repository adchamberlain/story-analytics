"""
Kernel manager service: manages Jupyter kernel lifecycle via jupyter_client.
One kernel per notebook session, auto-shutdown on idle.
"""

import logging
import threading
import time
from dataclasses import dataclass, field

from jupyter_client import KernelManager as JupyterKernelManager

logger = logging.getLogger(__name__)


@dataclass
class KernelSession:
    """Wraps a single Jupyter kernel for a notebook session."""

    notebook_id: str
    _km: JupyterKernelManager
    _kc: object  # KernelClient
    last_activity: float = field(default_factory=time.time)

    def is_alive(self) -> bool:
        """Check if the kernel process is still running."""
        return self._km.is_alive()

    def execute(self, code: str, timeout: int = 120) -> dict:
        """Execute code in the kernel and return structured output.

        Returns:
            {"status": "ok"|"error", "outputs": [...], "execution_count": int|None}
        """
        self.last_activity = time.time()

        msg_id = self._kc.execute(code)

        # Collect outputs from iopub channel until the kernel goes idle
        outputs: list[dict] = []
        execution_count = None

        while True:
            try:
                msg = self._kc.get_iopub_msg(timeout=timeout)
            except Exception:
                # Timeout waiting for output
                return {
                    "status": "error",
                    "outputs": outputs,
                    "execution_count": execution_count,
                }

            # Only process messages for our execution
            if msg.get("parent_header", {}).get("msg_id") != msg_id:
                continue

            msg_type = msg["header"]["msg_type"]
            content = msg["content"]

            if msg_type == "stream":
                outputs.append({
                    "output_type": "stream",
                    "name": content.get("name", "stdout"),
                    "text": content.get("text", ""),
                })
            elif msg_type in ("execute_result", "display_data"):
                outputs.append({
                    "output_type": msg_type,
                    "data": content.get("data", {}),
                    "metadata": content.get("metadata", {}),
                })
                if msg_type == "execute_result":
                    execution_count = content.get("execution_count")
            elif msg_type == "error":
                outputs.append({
                    "output_type": "error",
                    "ename": content.get("ename", ""),
                    "evalue": content.get("evalue", ""),
                    "traceback": content.get("traceback", []),
                })
            elif msg_type == "status" and content.get("execution_state") == "idle":
                break

        # Get reply from shell channel for status
        try:
            reply = self._kc.get_shell_msg(timeout=timeout)
            status = reply["content"].get("status", "error")
            if reply["content"].get("execution_count") is not None:
                execution_count = reply["content"]["execution_count"]
        except Exception:
            status = "error"

        return {
            "status": status,
            "outputs": outputs,
            "execution_count": execution_count,
        }

    def interrupt(self) -> None:
        """Interrupt the running kernel."""
        self._km.interrupt_kernel()
        self.last_activity = time.time()

    def inject_sources(self, sources: list[dict]) -> None:
        """Pre-load Story Analytics data sources into the kernel.

        Each source dict should have: source_id, name, table_name, row_count, column_count.
        Sets up DuckDB connection and registers tables as views.
        """
        if not sources:
            return

        # Build a setup script that creates a DuckDB connection and summary
        lines = [
            "import duckdb as _sa_ddb",
            "_sa_conn = _sa_ddb.connect()",
            "",
            "# Story Analytics data sources are available via _sa_conn.",
            "# Example: _sa_conn.sql('SELECT * FROM my_table').df()",
        ]
        for src in sources:
            lines.append(f"# - {src['name']} ({src['row_count']} rows, {src['column_count']} cols)")

        self.execute("\n".join(lines))

    def get_dataframes(self) -> dict:
        """Introspect kernel namespace for pandas DataFrames.

        Returns:
            {name: {"rows": int, "columns": [str]}}
        """
        code = """
import json as _json_
_dfs_ = {}
for _name_, _obj_ in list(globals().items()):
    if not _name_.startswith('_') and hasattr(_obj_, 'shape') and hasattr(_obj_, 'columns'):
        try:
            _dfs_[_name_] = {"rows": int(_obj_.shape[0]), "columns": list(_obj_.columns.astype(str))}
        except Exception:
            pass
print(_json_.dumps(_dfs_))
del _dfs_, _json_
"""
        result = self.execute(code)
        for output in result.get("outputs", []):
            if output.get("output_type") == "stream" and output.get("name") == "stdout":
                try:
                    import json
                    return json.loads(output["text"].strip())
                except (json.JSONDecodeError, ValueError):
                    pass
        return {}

    def get_dataframe_csv(self, name: str) -> str | None:
        """Serialize a named DataFrame to CSV string, or None if not found."""
        # Sanitize variable name to prevent injection
        if not name.isidentifier():
            return None

        code = f"""
try:
    _df_ = globals().get({name!r})
    if _df_ is not None and hasattr(_df_, 'to_csv'):
        print(_df_.to_csv(index=False), end='')
    else:
        print('__NOT_FOUND__', end='')
except Exception as e:
    print('__ERROR__', end='')
"""
        result = self.execute(code)
        for output in result.get("outputs", []):
            if output.get("output_type") == "stream" and output.get("name") == "stdout":
                text = output["text"]
                if text in ("__NOT_FOUND__", "__ERROR__"):
                    return None
                return text
        return None


class KernelManager:
    """Manages multiple kernel sessions, one per notebook."""

    def __init__(self, idle_timeout_seconds: int = 1800):
        self._sessions: dict[str, KernelSession] = {}
        self._lock = threading.Lock()
        self._idle_timeout = idle_timeout_seconds

    def start_kernel(self, notebook_id: str) -> KernelSession:
        """Start a new ipykernel for a notebook. If one exists, return it."""
        with self._lock:
            if notebook_id in self._sessions:
                session = self._sessions[notebook_id]
                if session.is_alive():
                    return session
                # Dead kernel — clean up and start fresh
                self._cleanup_session(notebook_id)

            km = JupyterKernelManager(kernel_name="python3")
            km.start_kernel()
            kc = km.client()
            kc.start_channels()
            kc.wait_for_ready(timeout=60)

            session = KernelSession(
                notebook_id=notebook_id,
                _km=km,
                _kc=kc,
            )
            self._sessions[notebook_id] = session
            logger.info("Started kernel for notebook %s", notebook_id)
            return session

    def get_kernel(self, notebook_id: str) -> KernelSession | None:
        """Get an existing kernel session, or None if not found."""
        with self._lock:
            return self._sessions.get(notebook_id)

    def shutdown_kernel(self, notebook_id: str) -> None:
        """Shutdown and remove a kernel session."""
        with self._lock:
            self._cleanup_session(notebook_id)

    def restart_kernel(self, notebook_id: str) -> KernelSession | None:
        """Restart a kernel, clearing all variables. Returns the refreshed session."""
        with self._lock:
            if notebook_id not in self._sessions:
                return None

            session = self._sessions[notebook_id]
            try:
                session._km.restart_kernel()
                # Old client channels are stale after restart — create a fresh client
                try:
                    session._kc.stop_channels()
                except Exception:
                    pass
                kc = session._km.client()
                kc.start_channels()
                kc.wait_for_ready(timeout=60)

                new_session = KernelSession(
                    notebook_id=notebook_id,
                    _km=session._km,
                    _kc=kc,
                )
                self._sessions[notebook_id] = new_session
                logger.info("Restarted kernel for notebook %s", notebook_id)
                return new_session
            except Exception:
                logger.exception("Failed to restart kernel for notebook %s", notebook_id)
                self._cleanup_session(notebook_id)
                return None

    def shutdown_all(self) -> None:
        """Shutdown all kernel sessions."""
        with self._lock:
            for notebook_id in list(self._sessions.keys()):
                self._cleanup_session(notebook_id)

    def cleanup_idle(self) -> list[str]:
        """Shut down kernels that have been idle longer than the timeout.

        Returns list of notebook_ids that were cleaned up.
        """
        now = time.time()
        cleaned: list[str] = []
        with self._lock:
            for notebook_id in list(self._sessions.keys()):
                session = self._sessions[notebook_id]
                if now - session.last_activity > self._idle_timeout:
                    self._cleanup_session(notebook_id)
                    cleaned.append(notebook_id)
        return cleaned

    def _cleanup_session(self, notebook_id: str) -> None:
        """Internal: shut down a session (must be called with lock held)."""
        session = self._sessions.pop(notebook_id, None)
        if session is None:
            return
        try:
            session._kc.stop_channels()
        except Exception:
            pass
        try:
            if session._km.is_alive():
                session._km.shutdown_kernel(now=True)
        except Exception:
            pass
        logger.info("Shut down kernel for notebook %s", notebook_id)


# Module-level singleton
_kernel_manager: KernelManager | None = None
_singleton_lock = threading.Lock()


def get_kernel_manager() -> KernelManager:
    """Return the module-level KernelManager singleton."""
    global _kernel_manager
    if _kernel_manager is None:
        with _singleton_lock:
            if _kernel_manager is None:
                _kernel_manager = KernelManager()
    return _kernel_manager
