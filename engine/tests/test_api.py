"""
Tests for API endpoints.

These tests verify API contract and response formats without
requiring a running server.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


# ============================================================================
# Test Setup
# ============================================================================


@pytest.fixture
def api_client():
    """Create a test client for the API."""
    from api.main import app
    return TestClient(app)


@pytest.fixture
def mock_conversation_manager():
    """Create a mock conversation manager."""
    from engine.conversation import ConversationResult, ActionButton

    manager = MagicMock()
    manager.process_message.return_value = ConversationResult(
        response="Test response",
        clarifying_options=None,
        action_buttons=[
            ActionButton(id="generate", label="Generate", style="primary"),
        ],
    )
    manager.state = MagicMock()
    manager.state.phase.value = "context"
    manager.state.messages = []
    manager.state.intent = "create"
    manager.state.target_dashboard = None
    manager.state.original_request = "test"

    return manager


# ============================================================================
# Conversation Endpoint Tests
# ============================================================================


class TestConversationEndpoints:
    """Test conversation API endpoints."""

    @pytest.mark.integration
    def test_new_conversation_returns_session_id(self, api_client):
        """POST /api/conversation/new should return a session ID."""
        with patch("api.routers.conversation.get_db") as mock_db:
            mock_session = MagicMock()
            mock_db.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_db.return_value.__exit__ = MagicMock(return_value=False)

            # Mock database operations
            mock_session.add = MagicMock()
            mock_session.commit = MagicMock()
            mock_session.refresh = MagicMock()

            response = api_client.post(
                "/api/conversation/new",
                json={"user_id": "test-user"},
            )

        # Should return 200 with session_id
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data

    @pytest.mark.integration
    def test_message_endpoint_returns_response(self, api_client, mock_conversation_manager):
        """POST /api/conversation/message should return assistant response."""
        with patch("api.routers.conversation.get_db") as mock_db, \
             patch("api.routers.conversation.ConversationManager") as mock_cm_class:

            # Set up database mock
            mock_session = MagicMock()
            mock_db.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_db.return_value.__exit__ = MagicMock(return_value=False)

            # Mock finding the session
            mock_db_session = MagicMock()
            mock_db_session.messages = "[]"
            mock_db_session.phase = "context"
            mock_db_session.intent = "create"
            mock_session.query.return_value.filter.return_value.first.return_value = mock_db_session

            # Set up conversation manager mock
            mock_cm_class.return_value = mock_conversation_manager

            response = api_client.post(
                "/api/conversation/message",
                json={
                    "session_id": "test-session",
                    "message": "Show me revenue",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "phase" in data

    @pytest.mark.integration
    def test_message_endpoint_includes_action_buttons(self, api_client, mock_conversation_manager):
        """Message response should include action buttons when available."""
        with patch("api.routers.conversation.get_db") as mock_db, \
             patch("api.routers.conversation.ConversationManager") as mock_cm_class:

            mock_session = MagicMock()
            mock_db.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_db.return_value.__exit__ = MagicMock(return_value=False)

            mock_db_session = MagicMock()
            mock_db_session.messages = "[]"
            mock_db_session.phase = "context"
            mock_db_session.intent = "create"
            mock_session.query.return_value.filter.return_value.first.return_value = mock_db_session

            mock_cm_class.return_value = mock_conversation_manager

            response = api_client.post(
                "/api/conversation/message",
                json={
                    "session_id": "test-session",
                    "message": "Show me revenue",
                },
            )

        data = response.json()
        assert "action_buttons" in data
        if data["action_buttons"]:
            assert data["action_buttons"][0]["id"] == "generate"


# ============================================================================
# Dashboard Endpoint Tests
# ============================================================================


class TestDashboardEndpoints:
    """Test dashboard API endpoints."""

    @pytest.mark.integration
    def test_list_dashboards_returns_array(self, api_client):
        """GET /api/dashboards should return array of dashboards."""
        with patch("api.routers.dashboards.get_db") as mock_db:
            mock_session = MagicMock()
            mock_db.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_db.return_value.__exit__ = MagicMock(return_value=False)
            mock_session.query.return_value.filter.return_value.all.return_value = []

            response = api_client.get("/api/dashboards?user_id=test")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.integration
    def test_get_dashboard_content(self, api_client, tmp_path):
        """GET /api/dashboards/{slug}/content should return markdown."""
        # Create test dashboard
        dashboard_dir = tmp_path / "pages" / "test-dashboard"
        dashboard_dir.mkdir(parents=True)
        dashboard_file = dashboard_dir / "+page.md"
        dashboard_file.write_text("# Test Dashboard\n\nContent here")

        with patch("api.routers.dashboards.PAGES_DIR", tmp_path / "pages"):
            response = api_client.get("/api/dashboards/test-dashboard/content")

        assert response.status_code == 200
        data = response.json()
        assert "content" in data
        assert "Test Dashboard" in data["content"]


# ============================================================================
# Provider Endpoint Tests
# ============================================================================


class TestProviderEndpoints:
    """Test LLM provider API endpoints."""

    @pytest.mark.integration
    def test_list_providers(self, api_client):
        """GET /api/providers should return available providers."""
        response = api_client.get("/api/providers")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least Claude
        provider_names = [p["name"] for p in data]
        assert "claude" in provider_names or "Claude" in provider_names


# ============================================================================
# Schema Endpoint Tests
# ============================================================================


class TestSchemaEndpoints:
    """Test database schema API endpoints."""

    @pytest.mark.integration
    def test_get_schema(self, api_client):
        """GET /api/schema should return database schema."""
        with patch("api.routers.sources.get_schema_context") as mock_schema:
            mock_schema.return_value = "Tables:\n- customers\n- invoices"

            response = api_client.get("/api/schema")

        assert response.status_code == 200
        data = response.json()
        assert "schema" in data
