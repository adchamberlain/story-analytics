"""
API configuration settings.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "sqlite:///data/story_analytics.db"

    # JWT Authentication
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 1 week

    # CORS - React app on port 3001
    cors_origins: list[str] = ["http://localhost:3001"]

    # API base URL for generating chart URLs
    api_base_url: str = "http://localhost:8000"

    # Frontend base URL for dashboard links
    frontend_base_url: str = "http://localhost:3001"

    # Legacy alias (for backwards compatibility)
    @property
    def evidence_base_url(self) -> str:
        return f"{self.frontend_base_url}/dashboard"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
