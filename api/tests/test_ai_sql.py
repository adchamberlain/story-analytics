"""
Tests for AI SQL generation endpoint.

Verifies request validation, provider configuration checks,
successful generation flow, and error handling.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def _patch_settings(monkeypatch, **kwargs):
    """Patch load_settings in the ai router's namespace."""
    import api.services.settings_storage as ss
    import api.routers.ai as ai_mod

    settings = ss.AppSettings(**kwargs)
    monkeypatch.setattr(ai_mod, "load_settings", lambda: settings)
    return settings


@pytest.mark.unit
class TestAiSqlEndpoint:
    """Test the POST /api/ai/sql endpoint."""

    def test_missing_provider_returns_400(self, monkeypatch):
        """No AI provider configured -> 400."""
        _patch_settings(monkeypatch)

        resp = client.post(
            "/api/ai/sql",
            json={
                "messages": [{"role": "user", "content": "show all users"}],
                "dialect": "snowflake",
                "schema_context": "Table users: id INT, name VARCHAR",
            },
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 400
        assert "No AI provider" in resp.json()["detail"]

    def test_missing_api_key_returns_400(self, monkeypatch):
        """Provider set but no key -> 400."""
        _patch_settings(monkeypatch, ai_provider="anthropic")

        resp = client.post(
            "/api/ai/sql",
            json={
                "messages": [{"role": "user", "content": "show all users"}],
                "dialect": "snowflake",
                "schema_context": "Table users: id INT",
            },
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 400
        assert "No API key" in resp.json()["detail"]

    def test_request_validation_missing_fields(self):
        """Missing required fields -> 422."""
        resp = client.post(
            "/api/ai/sql",
            json={"dialect": "snowflake"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    def test_successful_generation(self, monkeypatch):
        """Mock the LLM provider and verify the full flow."""
        _patch_settings(
            monkeypatch, ai_provider="anthropic", anthropic_api_key="sk-test-key"
        )

        mock_response = MagicMock()
        mock_response.content = "```sql\nSELECT * FROM users LIMIT 10\n```"

        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_response

        with patch(
            "api.routers.ai.get_provider", return_value=mock_provider
        ):
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": [{"role": "user", "content": "show all users"}],
                    "dialect": "snowflake",
                    "schema_context": "Table users: id INT, name VARCHAR",
                    "current_sql": "SELECT 1",
                    "error_message": "column not found",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        assert "SELECT * FROM users" in resp.json()["content"]

        # Verify provider was called with correct args
        call_args = mock_provider.generate.call_args
        # Messages should be converted to Message objects
        messages = call_args.kwargs["messages"]
        assert len(messages) == 1
        assert messages[0].role == "user"
        assert messages[0].content == "show all users"
        # System prompt should contain dialect, current_sql, and error
        system = call_args.kwargs["system_prompt"]
        assert "snowflake" in system
        assert "SELECT 1" in system
        assert "column not found" in system

    def test_successful_generation_openai(self, monkeypatch):
        """Verify OpenAI provider mapping works correctly."""
        _patch_settings(
            monkeypatch, ai_provider="openai", openai_api_key="sk-openai-test"
        )

        mock_response = MagicMock()
        mock_response.content = "```sql\nSELECT 1\n```"

        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_response

        with patch(
            "api.routers.ai.get_provider", return_value=mock_provider
        ) as mock_get:
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": [{"role": "user", "content": "test query"}],
                    "dialect": "postgres",
                    "schema_context": "Table t: id INT",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        mock_get.assert_called_once_with("openai")

    def test_successful_generation_google(self, monkeypatch):
        """Verify Google/Gemini provider mapping works correctly."""
        _patch_settings(
            monkeypatch, ai_provider="google", google_api_key="goog-test"
        )

        mock_response = MagicMock()
        mock_response.content = "```sql\nSELECT 1\n```"

        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_response

        with patch(
            "api.routers.ai.get_provider", return_value=mock_provider
        ) as mock_get:
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": [{"role": "user", "content": "test"}],
                    "dialect": "bigquery",
                    "schema_context": "Table t: id INT",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        mock_get.assert_called_once_with("gemini")

    def test_llm_error_returns_500(self, monkeypatch):
        """LLM failure -> 500."""
        _patch_settings(
            monkeypatch, ai_provider="anthropic", anthropic_api_key="sk-test-key"
        )

        mock_provider = MagicMock()
        mock_provider.generate.side_effect = RuntimeError("API timeout")

        with patch("api.routers.ai.get_provider", return_value=mock_provider):
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": [{"role": "user", "content": "test"}],
                    "dialect": "snowflake",
                    "schema_context": "Table users: id INT",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 500
        assert "AI generation failed" in resp.json()["detail"]

    def test_optional_fields_omitted(self, monkeypatch):
        """current_sql and error_message are optional; system prompt should not contain their sections."""
        _patch_settings(
            monkeypatch, ai_provider="anthropic", anthropic_api_key="sk-test-key"
        )

        mock_response = MagicMock()
        mock_response.content = "```sql\nSELECT 1\n```"

        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_response

        with patch("api.routers.ai.get_provider", return_value=mock_provider):
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": [{"role": "user", "content": "hello"}],
                    "dialect": "postgres",
                    "schema_context": "Table t: id INT",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        # System prompt should NOT contain current_sql or error sections
        system = mock_provider.generate.call_args.kwargs["system_prompt"]
        assert "Current SQL in editor" not in system
        assert "Last query error" not in system

    def test_multi_turn_conversation(self, monkeypatch):
        """Multiple messages in conversation are passed through correctly."""
        _patch_settings(
            monkeypatch, ai_provider="anthropic", anthropic_api_key="sk-test-key"
        )

        mock_response = MagicMock()
        mock_response.content = "Here is your updated query"

        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_response

        messages = [
            {"role": "user", "content": "show all users"},
            {"role": "assistant", "content": "SELECT * FROM users"},
            {"role": "user", "content": "add a WHERE clause for active users"},
        ]

        with patch("api.routers.ai.get_provider", return_value=mock_provider):
            resp = client.post(
                "/api/ai/sql",
                json={
                    "messages": messages,
                    "dialect": "snowflake",
                    "schema_context": "Table users: id INT, name VARCHAR, active BOOLEAN",
                },
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        call_messages = mock_provider.generate.call_args.kwargs["messages"]
        assert len(call_messages) == 3
        assert call_messages[0].role == "user"
        assert call_messages[1].role == "assistant"
        assert call_messages[2].role == "user"
