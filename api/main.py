"""
FastAPI application entry point.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env file before any other imports
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.requests import Request  # noqa: E402

from .config import get_settings  # noqa: E402
# Legacy SQLAlchemy create_tables skipped — metadata_db._ensure_tables() handles schema
from .routers import auth_router  # noqa: E402
from .auth_simple import router as auth_simple_router  # noqa: E402
from .routers.data import router as data_router  # noqa: E402
from .routers.charts_v2 import router as charts_v2_router  # noqa: E402
from .routers.dashboards_v2 import router as dashboards_v2_router  # noqa: E402
from .routers.connections import router as connections_router  # noqa: E402
from .routers.settings import router as settings_router  # noqa: E402
from .routers.themes import router as themes_router  # noqa: E402
from .routers.folders import router as folders_router  # noqa: E402
from .routers.templates import router as templates_router  # noqa: E402
from .routers.api_keys import router as api_keys_router  # noqa: E402
from .routers.comments import router as comments_router  # noqa: E402
from .routers.teams import router as teams_router  # noqa: E402
from .routers.notifications import router as notifications_router  # noqa: E402
from .routers.versions import router as versions_router  # noqa: E402
from .routers.transforms import router as transforms_router  # noqa: E402
from .routers.admin import router as admin_router  # noqa: E402

settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Story Analytics API",
    description="""
## Story Analytics API

Create data-driven dashboards and charts through AI-powered natural language conversation.

### Authentication

By default, authentication is disabled (`AUTH_ENABLED=false`). When enabled:
- Register/login via `/api/auth/register` and `/api/auth/login` to get a JWT token
- Pass JWT token in `Authorization: Bearer <token>` header
- Or use API keys via `X-API-Key` header or `?api_key=` query parameter

### Quick Start

1. Upload data: `POST /api/data/upload` with a CSV file
2. Create chart: `POST /api/v2/charts/save` with chart configuration
3. View chart: `GET /api/v2/charts/{chartId}`
4. Publish: `PUT /api/v2/charts/{chartId}/publish`
5. Embed: Use the embed URL at `/embed/chart/{chartId}`
""",
    version="0.2.0",
    openapi_tags=[
        {"name": "auth", "description": "Authentication and user management"},
        {"name": "charts", "description": "Chart CRUD, AI proposals, publishing, and export"},
        {"name": "dashboards", "description": "Dashboard CRUD, layout, filters, and publishing"},
        {"name": "data", "description": "Data source upload, query, and schema inspection"},
        {"name": "connections", "description": "External database connections (BigQuery, Postgres, etc.)"},
        {"name": "settings", "description": "Application settings and AI provider configuration"},
        {"name": "themes", "description": "Chart theme management and customization"},
        {"name": "folders", "description": "Chart and dashboard folder organization"},
        {"name": "templates", "description": "Chart template gallery and management"},
        {"name": "api-keys", "description": "API key management for programmatic access"},
    ],
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # All routes
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Embed/public routes get additional headers
        path = request.url.path
        if "/embed/" in path or "/public/" in path:
            response.headers["Permissions-Policy"] = (
                "camera=(), microphone=(), geolocation=()"
            )
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; script-src 'self' 'unsafe-inline'; "
                "frame-ancestors *"
            )
            response.headers["X-Frame-Options"] = "ALLOWALL"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(auth_simple_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(charts_v2_router, prefix="/api")
app.include_router(dashboards_v2_router, prefix="/api")
app.include_router(connections_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(themes_router, prefix="/api")
app.include_router(folders_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(api_keys_router, prefix="/api")
app.include_router(comments_router, prefix="/api")
app.include_router(teams_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(versions_router, prefix="/api")
app.include_router(transforms_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


def _seed_data_if_empty():
    """Copy seed data into data/ on first run so new users see an example dashboard."""
    import logging
    from api.services.storage import get_storage

    logger = logging.getLogger("story_analytics")
    storage = get_storage()
    seed_dir = Path(__file__).parent.parent / "data" / "seed"

    if not seed_dir.exists():
        return

    # Only seed if no charts exist yet
    if storage.list("charts/"):
        return

    # Copy seed files through storage backend
    for subdir in seed_dir.iterdir():
        if subdir.is_dir():
            for f in subdir.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(seed_dir)
                    storage.write(str(rel), f.read_bytes())

    logger.info("Loaded seed data: The Perfect Dashboard with 25 example charts")


@app.on_event("startup")
async def startup():
    """Initialize database tables on startup with retry for cloud deployments."""
    import time
    import logging
    logger = logging.getLogger(__name__)

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            # metadata_db._ensure_tables() creates all needed tables
            from .services.metadata_db import ensure_default_user
            ensure_default_user()
            # Seed example dashboard on first run
            _seed_data_if_empty()
            return
        except Exception as e:
            if attempt < max_retries:
                wait = attempt * 2
                logger.warning(f"Startup attempt {attempt}/{max_retries} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"Startup failed after {max_retries} attempts: {e}")
                raise


@app.get("/")
async def root():
    """Root endpoint — serves SPA in production, API info otherwise."""
    _static_index = os.path.join(
        os.path.dirname(__file__), "..", "static", "index.html"
    )
    if os.path.isfile(_static_index):
        return FileResponse(_static_index)
    return {
        "name": "Story Analytics API",
        "version": "0.2.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/providers")
async def list_providers():
    """List available LLM providers."""
    return {
        "providers": [
            {"id": "claude", "name": "Claude (Anthropic)", "models": ["claude-sonnet-4-20250514"]},
            {"id": "openai", "name": "OpenAI", "models": ["gpt-4o", "gpt-4-turbo"]},
            {"id": "gemini", "name": "Gemini (Google)", "models": ["gemini-2.0-flash", "gemini-2.5-pro"]},
        ]
    }


# ---------------------------------------------------------------------------
# Serve built React SPA in production (when static/ dir exists)
# ---------------------------------------------------------------------------
_static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(_static_dir):
    # Serve embed.html for embed routes (separate entry point)
    @app.get("/embed/{rest:path}")
    async def _serve_embed(rest: str):
        embed_html = os.path.join(_static_dir, "embed.html")
        if os.path.isfile(embed_html):
            return FileResponse(embed_html)
        return FileResponse(os.path.join(_static_dir, "index.html"))

    # Serve static assets (JS, CSS chunks)
    _assets_dir = os.path.join(_static_dir, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="static-assets")

    # Serve basemaps if present
    _basemaps_dir = os.path.join(_static_dir, "basemaps")
    if os.path.isdir(_basemaps_dir):
        app.mount("/basemaps", StaticFiles(directory=_basemaps_dir), name="basemaps")

    # SPA catch-all: serve index.html for all other non-API routes
    @app.get("/{path:path}")
    async def _serve_spa(path: str):
        # Check if it's a real static file
        file_path = os.path.join(_static_dir, path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(os.path.join(_static_dir, "index.html"))
