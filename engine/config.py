"""
Configuration management for the conversation engine.
"""

import os
from pathlib import Path
from typing import Any

import yaml


class Config:
    """Load and manage configuration from engine_config.yaml."""

    def __init__(self, config_path: str | None = None):
        if config_path is None:
            # Default to engine_config.yaml in project root
            config_path = Path(__file__).parent.parent / "engine_config.yaml"

        self.config_path = Path(config_path)
        self._config = self._load_config()

    def _load_config(self) -> dict[str, Any]:
        """Load configuration from YAML file."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path) as f:
            return yaml.safe_load(f)

    @property
    def llm_provider(self) -> str:
        """Get the configured LLM provider name."""
        return self._config.get("llm", {}).get("provider", "claude")

    @property
    def llm_model(self) -> str:
        """Get the configured LLM model."""
        return self._config.get("llm", {}).get("model", "claude-sonnet-4-20250514")

    @property
    def llm_api_key(self) -> str:
        """Get the LLM API key from environment variable."""
        env_var = self._config.get("llm", {}).get("api_key_env", "ANTHROPIC_API_KEY")
        api_key = os.environ.get(env_var)
        if not api_key:
            raise ValueError(f"API key not found in environment variable: {env_var}")
        return api_key

    @property
    def snowflake_connection_file(self) -> Path:
        """Get the path to the Snowflake connection YAML."""
        rel_path = self._config.get("snowflake", {}).get("connection_file", "")
        return self.config_path.parent / rel_path

    @property
    def pages_dir(self) -> Path:
        """Get the Evidence pages directory."""
        rel_path = self._config.get("evidence", {}).get("pages_dir", "pages/")
        return self.config_path.parent / rel_path

    @property
    def dev_url(self) -> str:
        """Get the Evidence dev server URL."""
        return self._config.get("evidence", {}).get("dev_url", "http://localhost:3000")

    def get_snowflake_config(self) -> dict[str, Any]:
        """Load and return the Snowflake connection configuration."""
        conn_file = self.snowflake_connection_file
        if not conn_file.exists():
            raise FileNotFoundError(f"Snowflake connection file not found: {conn_file}")

        with open(conn_file) as f:
            config = yaml.safe_load(f)

        return config.get("options", {})


# Global config instance
_config: Config | None = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = Config()
    return _config
