"""
FastAPI application entry point.
"""

from pathlib import Path
from dotenv import load_dotenv

# Load .env file before any other imports
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_tables
from .routers import auth_router, conversation_router, dashboards_router, templates_router
from .routers.sources import router as sources_router
from .routers.chart import router as chart_router
from .routers.render import router as render_router
from .routers.data import router as data_router
from .routers.charts_v2 import router as charts_v2_router
from .routers.dashboards_v2 import router as dashboards_v2_router
from .routers.connections import router as connections_router
from .routers.settings import router as settings_router

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

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(conversation_router, prefix="/api")
app.include_router(dashboards_router, prefix="/api")
app.include_router(sources_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(chart_router, prefix="/api")
app.include_router(render_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(charts_v2_router, prefix="/api")
app.include_router(dashboards_v2_router, prefix="/api")
app.include_router(connections_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


@app.on_event("startup")
async def startup():
    """Create database tables on startup."""
    create_tables()


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
