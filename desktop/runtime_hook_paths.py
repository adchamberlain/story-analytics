# desktop/runtime_hook_paths.py
"""
PyInstaller runtime hook — runs before server_entry.py.

Problem: api/main.py uses os.path.dirname(__file__) + "/../static" to find
the React build. In a PyInstaller bundle, frozen module __file__ paths contain
directory components (e.g. <_MEIPASS>/api/main.py), but those directories don't
physically exist — modules are frozen in the PYZ archive. The kernel can't
traverse '..' through a nonexistent directory, so os.path.isdir() returns False.

Fix: ensure <_MEIPASS>/api/ exists as a real directory so the OS can resolve
the '..' traversal in paths like <_MEIPASS>/api/../static.
"""
import os
import sys

if hasattr(sys, "_MEIPASS"):
    # Create stub directories for packages that use __file__-relative path logic.
    for pkg_dir in ["api", "engine"]:
        stub = os.path.join(sys._MEIPASS, pkg_dir)
        os.makedirs(stub, exist_ok=True)
