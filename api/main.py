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
from .routers.settings import router as settings_router
from .routers.themes import router as themes_router  # noqa: E402
from .routers.folders import router as folders_router  # noqa: E402
from .routers.templates import router as templates_router  # noqa: E402
from .routers.comments import router as comments_router  # noqa: E402
from .routers.teams import router as teams_router  # noqa: E402
from .routers.notifications import router as notifications_router  # noqa: E402

settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Story Analytics API",
    description="API for creating data dashboards through natural language conversation",
    version="0.1.0",
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
app.include_router(comments_router, prefix="/api")
app.include_router(teams_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")


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
        "version": "0.1.0",
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
