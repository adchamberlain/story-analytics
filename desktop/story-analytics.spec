# desktop/story-analytics.spec
"""
PyInstaller spec for Story Analytics API server.

Run from the REPO ROOT:
    pyinstaller desktop/story-analytics.spec --clean --distpath desktop/dist-python

Output: desktop/dist-python/story-analytics-api/
"""
import sys
from pathlib import Path

block_cipher = None

# SPECPATH is the directory containing this spec file (desktop/)
REPO_ROOT = str(Path(SPECPATH).parent)

a = Analysis(
    [str(Path(SPECPATH).parent / "desktop" / "server_entry.py")],
    pathex=[REPO_ROOT],
    binaries=[],
    datas=[
        # Built React SPA — must exist before running pyinstaller (built by build.sh)
        (str(Path(REPO_ROOT) / "static"), "static"),
        # Seed dashboard shown to new users on first launch
        (str(Path(REPO_ROOT) / "data" / "seed"), "data/seed"),
        # YAML configs used by the engine
        (str(Path(REPO_ROOT) / "engine_config.yaml"), "."),
        (str(Path(REPO_ROOT) / "brand_config.yaml"), "."),
    ],
    hiddenimports=[
        # uvicorn internals (static analysis misses these)
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # passlib bcrypt backend
        "passlib.handlers.bcrypt",
        "passlib.handlers.sha2_crypt",
        # JWT
        "jose",
        "jose.jwt",
        "jose.jws",
        "jose.jwk",
        "jose.constants",
        "jose.backends",
        "jose.backends.cryptography_backend",
        # email validation
        "email_validator",
        # multipart file upload
        "multipart",
        "python_multipart",
        # async support
        "anyio",
        "anyio.from_thread",
        "anyio._backends._asyncio",
        # LLM clients
        "anthropic",
        "openai",
        "google.genai",
        # Snowflake (optional connector — keep for full feature parity)
        "snowflake.connector",
        "snowflake.connector.auth",
        "snowflake.connector.cursor",
        "snowflake.connector.network",
        "snowflake.connector.converter",
        # email service
        "resend",
        # LookML parser
        "lkml",
        # SQLAlchemy (used by some auth routers)
        "sqlalchemy.dialects.sqlite",
        # pydantic v2 internals
        "pydantic.deprecated.class_validators",
        "pydantic_settings",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Test infrastructure — never ship these
        "playwright",
        "pytest",
        "pytest_cov",
        "coverage",
        # Jupyter (pulled in transitively by some packages)
        "IPython",
        "jupyter",
        "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Collect all files for packages with complex internal module structures.
# This handles dynamic imports that static analysis can't detect.
from PyInstaller.utils.hooks import collect_all

for pkg in [
    "duckdb",
    "snowflake.connector",
    "google.cloud.bigquery",
    "cryptography",
]:
    tmp_ret = collect_all(pkg)
    a.datas += tmp_ret[0]
    a.binaries += tmp_ret[1]
    a.hiddenimports += tmp_ret[2]

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="story-analytics-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX can break binary deps on macOS — leave off
    console=True,  # True = writes logs to stderr (captured by Electron)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,  # None = native arch of build machine
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="story-analytics-api",
)
