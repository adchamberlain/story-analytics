# desktop/server_entry.py
"""
PyInstaller entry point for the Story Analytics API server.

When frozen, sys._MEIPASS contains the bundle directory.
uvicorn is started here, not imported — this avoids PyInstaller
having to analyze uvicorn's CLI which has many hidden imports.
"""
import os
import sys

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
    )
