"""
FastAPI application entry point.
"""

from pathlib import Path
from dotenv import load_dotenv

# Load .env file before any other imports
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.requests import Request  # noqa: E402

from .config import get_settings  # noqa: E402
from .database import create_tables  # noqa: E402
from .routers import auth_router  # noqa: E402
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
from .routers.transforms import router as transforms_router  # noqa: E402

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
app.include_router(transforms_router, prefix="/api")


@app.on_event("startup")
async def startup():
    """Create database tables on startup."""
    create_tables()
    # Ensure default user exists so sharing/metadata FK constraints are satisfied
    from .services.metadata_db import ensure_default_user
    ensure_default_user()


@app.get("/")
async def root():
    """Root endpoint."""
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
