"""
Settings storage: save and load app settings (LLM provider, API keys) as JSON.
Local-first persistence via a single JSON file at settings.json.

On first load, bootstraps from environment variables so existing .env users
aren't broken. After save, pushes keys into os.environ so downstream code
that reads env vars still works without restart.
"""

import json
import os
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, fields as dc_fields

from api.services.storage import get_storage

_storage = get_storage()

# Map provider names to the env var that holds their API key
_PROVIDER_KEY_MAP = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
}


@dataclass
class AppSettings:
    ai_provider: str = ""          # "anthropic" | "openai" | "google" | ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    updated_at: str = ""


def load_settings() -> AppSettings:
    """Load settings from settings.json, bootstrapping from env vars if needed."""
    if _storage.exists("settings.json"):
        data = json.loads(_storage.read_text("settings.json"))
        known = {f.name for f in dc_fields(AppSettings)}
        settings = AppSettings(**{k: v for k, v in data.items() if k in known})

        # Sync keys into os.environ so downstream LLM providers (which read
        # env vars) work after a server restart without needing a re-save.
        # Always overwrite: settings.json is the source of truth once it exists.
        for provider, env_var in _PROVIDER_KEY_MAP.items():
            key_value = getattr(settings, f"{provider}_api_key", "")
            if key_value:
                os.environ[env_var] = key_value

        return settings

    # Bootstrap from environment variables
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    google_key = os.environ.get("GOOGLE_API_KEY", "")

    # Auto-detect provider from whichever key is set
    provider = ""
    if anthropic_key:
        provider = "anthropic"
    elif openai_key:
        provider = "openai"
    elif google_key:
        provider = "google"

    return AppSettings(
        ai_provider=provider,
        anthropic_api_key=anthropic_key,
        openai_api_key=openai_key,
        google_api_key=google_key,
    )


def save_settings(**fields: str) -> AppSettings:
    """Merge fields into existing settings, write to settings.json,
    and push API keys into os.environ so LLM calls work immediately."""
    current = load_settings()

    for key, value in fields.items():
        if hasattr(current, key):
            setattr(current, key, value)

    current.updated_at = datetime.now(timezone.utc).isoformat()

    # Persist to disk via storage backend
    _storage.write_text("settings.json", json.dumps(asdict(current), indent=2))

    # Push keys into os.environ so downstream code works immediately.
    # Clear env var when key is removed so providers stop using the old key.
    for provider, env_var in _PROVIDER_KEY_MAP.items():
        key_value = getattr(current, f"{provider}_api_key", "")
        if key_value:
            os.environ[env_var] = key_value
        else:
            os.environ.pop(env_var, None)

    return current


def mask_key(key: str) -> str:
    """Mask an API key for display: show first 7 chars + ****."""
    if not key or len(key) < 8:
        return ""
    return key[:7] + "****"
