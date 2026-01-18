"""
Unit tests for conversation phase transitions and state machine.

These tests verify that the conversation flow works correctly without
making any LLM API calls.
"""

import pytest
from unittest.mock import patch, MagicMock

from engine.conversation import (
    ConversationManager,
    ConversationPhase,
    ConversationState,
    ActionButton,
    ClarifyingOption,
)


# ============================================================================
# Phase Transition Tests
# ============================================================================


class TestPhaseTransitions:
    """Test the conversation state machine phase transitions."""

    @pytest.mark.unit
    def test_initial_phase_is_intent(self, conversation_manager_with_mock_llm):
        """New conversation should start in INTENT phase."""
        manager = conversation_manager_with_mock_llm
        assert manager.state.phase == ConversationPhase.INTENT

    @pytest.mark.unit
    def test_text_input_transitions_intent_to_context(self, conversation_manager_with_mock_llm):
        """Text input in INTENT phase should transition to CONTEXT."""
        manager = conversation_manager_with_mock_llm

        # User describes what they want
        manager.process_message("Show me monthly revenue trends")

        assert manager.state.phase == ConversationPhase.CONTEXT
        assert manager.state.intent == "create"
        assert manager.state.original_request == "Show me monthly revenue trends"

    @pytest.mark.unit
    def test_create_new_action_transitions_to_context(self, conversation_manager_with_mock_llm):
        """Create new action button should transition to CONTEXT."""
        manager = conversation_manager_with_mock_llm

        result = manager.process_message("__action:create_new")

        assert manager.state.phase == ConversationPhase.CONTEXT
        assert manager.state.intent == "create"
        assert "What kind of dashboard" in result.response

    @pytest.mark.unit
    def test_generate_action_transitions_to_generation(self, conversation_manager_with_mock_llm, mock_pipeline):
        """Generate action should transition to GENERATION then REFINEMENT."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        # First get to CONTEXT phase
        manager.process_message("Show me revenue dashboard")

        # Mock file creation
        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_path = MagicMock()
            mock_path.parent.name = "test-dashboard"
            mock_path.read_text.return_value = "# Test"
            mock_create.return_value = mock_path

            with patch.object(manager, "_run_qa_validation", return_value=None):
                result = manager.process_message("__action:generate")

        # Should end up in REFINEMENT after generation
        assert manager.state.phase == ConversationPhase.REFINEMENT

    @pytest.mark.unit
    def test_done_action_ends_conversation(self, conversation_manager_with_mock_llm):
        """Done action should complete the conversation flow."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.REFINEMENT
        manager.state.created_file = MagicMock()
        manager.state.created_file.parent.name = "my-dashboard"

        result = manager.process_message("__action:done")

        assert "ready" in result.response.lower()
        assert result.action_buttons is None  # No more buttons

    @pytest.mark.unit
    def test_modify_action_stays_in_refinement(self, conversation_manager_with_mock_llm):
        """Modify action should stay in REFINEMENT phase."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.REFINEMENT
        manager.state.created_file = MagicMock()

        result = manager.process_message("__action:modify")

        assert manager.state.phase == ConversationPhase.REFINEMENT
        assert "change" in result.response.lower()
        # Should still have action buttons
        assert result.action_buttons is not None

    @pytest.mark.unit
    def test_modify_plan_stays_in_context(self, conversation_manager_with_mock_llm):
        """Modify plan action should stay in CONTEXT phase."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.CONTEXT

        result = manager.process_message("__action:modify_plan")

        assert manager.state.phase == ConversationPhase.CONTEXT
        assert "change" in result.response.lower() or "add" in result.response.lower()


# ============================================================================
# Action Button Tests
# ============================================================================


class TestActionButtons:
    """Test action button generation and handling."""

    @pytest.mark.unit
    def test_context_phase_shows_generate_buttons(self, conversation_manager_with_mock_llm):
        """CONTEXT phase should show Generate and Modify Plan buttons."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.CONTEXT

        # Simulate being in context with some messages
        manager.state.messages = [
            MagicMock(role="user", content="Show me revenue"),
            MagicMock(role="assistant", content="I can help with that."),
        ]

        buttons = manager._get_action_buttons_for_phase(pre_message_count=2)

        assert buttons is not None
        assert len(buttons) == 2
        assert buttons[0].id == "generate"
        assert buttons[0].style == "primary"
        assert buttons[1].id == "modify_plan"
        assert buttons[1].style == "secondary"

    @pytest.mark.unit
    def test_refinement_phase_shows_done_modify_buttons(self, conversation_manager_with_mock_llm):
        """REFINEMENT phase should show Done and Modify buttons."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.REFINEMENT

        buttons = manager._get_action_buttons_for_phase(pre_message_count=1)

        assert buttons is not None
        assert len(buttons) == 2
        assert buttons[0].id == "done"
        assert buttons[0].style == "primary"
        assert buttons[1].id == "modify"
        assert buttons[1].style == "secondary"

    @pytest.mark.unit
    def test_generation_phase_has_no_buttons(self, conversation_manager_with_mock_llm):
        """GENERATION phase should have no action buttons (auto-advances)."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.GENERATION

        buttons = manager._get_action_buttons_for_phase(pre_message_count=1)

        assert buttons is None

    @pytest.mark.unit
    def test_intent_phase_has_no_buttons(self, conversation_manager_with_mock_llm):
        """INTENT phase should have no action buttons initially."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase = ConversationPhase.INTENT

        buttons = manager._get_action_buttons_for_phase(pre_message_count=0)

        assert buttons is None


# ============================================================================
# State Management Tests
# ============================================================================


class TestStateManagement:
    """Test conversation state tracking and management."""

    @pytest.mark.unit
    def test_reset_clears_state(self, conversation_manager_with_mock_llm):
        """Reset should clear all conversation state."""
        manager = conversation_manager_with_mock_llm

        # Populate state
        manager.state.phase = ConversationPhase.REFINEMENT
        manager.state.intent = "create"
        manager.state.messages = [MagicMock()]
        manager.state.original_request = "test request"

        manager.reset()

        assert manager.state.phase == ConversationPhase.INTENT
        assert manager.state.intent is None
        assert len(manager.state.messages) == 0
        assert manager.state.original_request is None

    @pytest.mark.unit
    def test_original_request_tracked(self, conversation_manager_with_mock_llm):
        """Original user request should be tracked for QA."""
        manager = conversation_manager_with_mock_llm

        manager.process_message("Create a dashboard showing monthly recurring revenue by customer segment")

        assert manager.state.original_request is not None
        assert "monthly recurring revenue" in manager.state.original_request

    @pytest.mark.unit
    def test_messages_accumulated(self, conversation_manager_with_mock_llm):
        """Messages should accumulate in conversation history."""
        manager = conversation_manager_with_mock_llm

        manager.process_message("First message")
        manager.process_message("Second message")

        # Should have user messages and assistant responses
        user_messages = [m for m in manager.state.messages if m.role == "user"]
        assert len(user_messages) == 2


# ============================================================================
# Clarifying Questions Tests
# ============================================================================


class TestClarifyingQuestions:
    """Test clarifying question parsing and handling."""

    @pytest.mark.unit
    def test_parse_clarifying_options_extracts_options(self, conversation_manager_with_mock_llm):
        """Should correctly parse clarifying question markup."""
        manager = conversation_manager_with_mock_llm

        response = """I can help with that!

[CLARIFYING_QUESTION]
What time period would you like to analyze?
[OPTIONS]
- Last 30 days
- Last 90 days
- Year to date
[/CLARIFYING_QUESTION]"""

        cleaned, options = manager._parse_clarifying_options(response)

        assert "What time period" in cleaned
        assert options is not None
        assert len(options) == 3
        assert options[0].label == "Last 30 days"
        assert options[1].label == "Last 90 days"
        assert options[2].label == "Year to date"

    @pytest.mark.unit
    def test_parse_clarifying_no_markup_returns_original(self, conversation_manager_with_mock_llm):
        """Response without markup should return unchanged."""
        manager = conversation_manager_with_mock_llm

        response = "This is a regular response without any markup."

        cleaned, options = manager._parse_clarifying_options(response)

        assert cleaned == response
        assert options is None

    @pytest.mark.unit
    def test_vague_input_detection(self, conversation_manager_with_mock_llm):
        """Should detect vague input based on word count threshold."""
        manager = conversation_manager_with_mock_llm

        # Short input should be vague
        assert manager._is_vague_input("dashboard please") is True

        # Longer input should not be vague
        assert manager._is_vague_input(
            "Show me a dashboard with monthly revenue trends broken down by customer segment"
        ) is False


# ============================================================================
# Full User Request Extraction Tests
# ============================================================================


class TestFullUserRequestExtraction:
    """Test extraction of full user request from conversation history."""

    @pytest.mark.unit
    def test_get_full_user_request_returns_longest_substantive(self, conversation_manager_with_mock_llm):
        """Should return the longest substantive user message."""
        manager = conversation_manager_with_mock_llm
        from engine.llm.base import Message

        manager.state.messages = [
            Message(role="user", content="create"),
            Message(role="assistant", content="What would you like?"),
            Message(role="user", content="Show me monthly revenue with customer segmentation and churn analysis"),
        ]

        request = manager.get_full_user_request()

        assert "monthly revenue" in request
        assert "customer segmentation" in request

    @pytest.mark.unit
    def test_get_full_user_request_filters_confirmations(self, conversation_manager_with_mock_llm):
        """Should filter out simple confirmations."""
        manager = conversation_manager_with_mock_llm
        from engine.llm.base import Message

        manager.state.original_request = "Show me revenue trends"
        manager.state.messages = [
            Message(role="user", content="Show me revenue trends"),
            Message(role="assistant", content="Generating..."),
            Message(role="user", content="yes"),
            Message(role="user", content="looks good"),
        ]

        request = manager.get_full_user_request()

        assert request == "Show me revenue trends"
        assert "yes" not in request
        assert "looks good" not in request
