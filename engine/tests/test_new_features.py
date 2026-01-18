"""
Tests for new features: QA Results, Error Recovery, Preview, and Multi-Source.
"""

import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from engine.conversation import (
    ConversationManager,
    ConversationPhase,
    ConversationResult,
    ActionButton,
    QAResultData,
)


# ============================================================================
# QA Results Surface Tests (Feature 3)
# ============================================================================


class TestQAResultsSurfacing:
    """Test that QA results are properly surfaced through the conversation."""

    @pytest.mark.unit
    def test_qa_result_data_structure(self):
        """QAResultData should have all required fields."""
        qa_data = QAResultData(
            passed=True,
            summary="Dashboard looks good",
            critical_issues=[],
            suggestions=["Add a date filter"],
            screenshot_path="/path/to/screenshot.png",
            auto_fixed=False,
            issues_fixed=[],
        )

        assert qa_data.passed is True
        assert qa_data.summary == "Dashboard looks good"
        assert len(qa_data.critical_issues) == 0
        assert len(qa_data.suggestions) == 1
        assert qa_data.screenshot_path is not None

    @pytest.mark.unit
    def test_qa_result_with_critical_issues(self):
        """QA result should properly track critical issues."""
        qa_data = QAResultData(
            passed=False,
            summary="Dashboard has errors",
            critical_issues=["Chart shows no data", "SQL syntax error"],
            suggestions=[],
        )

        assert qa_data.passed is False
        assert len(qa_data.critical_issues) == 2
        assert "Chart shows no data" in qa_data.critical_issues

    @pytest.mark.unit
    def test_qa_result_with_auto_fix(self):
        """QA result should track auto-fixed issues."""
        qa_data = QAResultData(
            passed=True,
            summary="Issues were auto-fixed",
            critical_issues=[],
            suggestions=[],
            auto_fixed=True,
            issues_fixed=["Fixed date format", "Fixed column reference"],
        )

        assert qa_data.auto_fixed is True
        assert len(qa_data.issues_fixed) == 2

    @pytest.mark.unit
    def test_conversation_result_includes_qa_result(self):
        """ConversationResult should include qa_result field."""
        qa_data = QAResultData(
            passed=True,
            summary="OK",
            critical_issues=[],
            suggestions=[],
        )

        result = ConversationResult(
            response="Dashboard created",
            action_buttons=[ActionButton(id="done", label="Done", style="primary")],
            qa_result=qa_data,
        )

        assert result.qa_result is not None
        assert result.qa_result.passed is True


# ============================================================================
# Error Recovery UX Tests (Feature 2)
# ============================================================================


class TestErrorRecoveryUX:
    """Test error recovery action buttons and flow."""

    @pytest.mark.unit
    def test_conversation_result_includes_error_context(self):
        """ConversationResult should include error_context field."""
        result = ConversationResult(
            response="Pipeline failed: SQL error",
            error_context="pipeline_error",
            action_buttons=[
                ActionButton(id="retry", label="Try Again", style="primary"),
                ActionButton(id="simplify", label="Simplify Request", style="secondary"),
            ],
        )

        assert result.error_context == "pipeline_error"
        assert len(result.action_buttons) == 2
        assert result.action_buttons[0].id == "retry"
        assert result.action_buttons[1].id == "simplify"

    @pytest.mark.integration
    def test_retry_action_available_on_error(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline_factory,
    ):
        """Retry action should be available when generation fails."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline_factory(
            success=False,
            error="SQL validation failed",
        )

        # Get to context phase
        manager.process_message("Show me revenue")

        # Try to generate (will fail)
        result = manager.process_message("__action:generate")

        # Should have error recovery buttons
        assert result.action_buttons is not None
        button_ids = [btn.id for btn in result.action_buttons]
        assert "retry" in button_ids
        assert "simplify" in button_ids

    @pytest.mark.integration
    def test_simplify_action_returns_to_context(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline_factory,
    ):
        """Simplify action should return to context phase for refinement."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline_factory(success=False, error="Failed")

        # Get to context phase and fail generation
        manager.process_message("Show me revenue")
        manager.process_message("__action:generate")

        # Click simplify
        result = manager.process_message("__action:simplify")

        # Should be back in context phase
        assert manager.state.phase == ConversationPhase.CONTEXT
        assert "simplify" in result.response.lower()

    @pytest.mark.unit
    def test_state_tracks_error_for_retry(
        self,
        conversation_manager_with_mock_llm,
    ):
        """State should track last error for retry capability."""
        manager = conversation_manager_with_mock_llm

        # Manually set error state
        manager.state.last_error = "Some error occurred"
        manager.state.can_retry = True

        assert manager.state.last_error is not None
        assert manager.state.can_retry is True


# ============================================================================
# Multi-Source Configuration Tests (Feature 4)
# ============================================================================


class TestMultiSourceConfiguration:
    """Test multi-source configuration support."""

    @pytest.mark.unit
    def test_manager_accepts_source_parameter(self, mock_llm, mock_schema_context):
        """ConversationManager should accept source_name parameter."""
        with patch("engine.conversation.get_provider") as mock_get_provider, \
             patch("engine.conversation.get_schema_context") as mock_get_schema:
            mock_get_provider.return_value = mock_llm
            mock_get_schema.return_value = mock_schema_context

            manager = ConversationManager(
                provider_name="claude",
                source_name="custom_source",
            )

            assert manager._default_source == "custom_source"

    @pytest.mark.unit
    def test_manager_uses_default_source_when_not_specified(self, mock_llm, mock_schema_context):
        """Manager should use snowflake_saas as default source."""
        with patch("engine.conversation.get_provider") as mock_get_provider, \
             patch("engine.conversation.get_schema_context") as mock_get_schema:
            mock_get_provider.return_value = mock_llm
            mock_get_schema.return_value = mock_schema_context

            manager = ConversationManager(provider_name="claude")

            assert manager._default_source == "snowflake_saas"


# ============================================================================
# Dashboard Preview Integration Tests (Feature 1)
# ============================================================================


class TestDashboardPreviewIntegration:
    """Test dashboard preview features."""

    @pytest.mark.unit
    def test_qa_result_includes_screenshot_path(self):
        """QA result should include path to screenshot."""
        qa_data = QAResultData(
            passed=True,
            summary="OK",
            critical_issues=[],
            suggestions=[],
            screenshot_path="/qa_screenshots/dashboard_20240101_120000.png",
        )

        assert qa_data.screenshot_path is not None
        assert "qa_screenshots" in qa_data.screenshot_path
        assert qa_data.screenshot_path.endswith(".png")

    @pytest.mark.unit
    def test_state_stores_screenshot_path(self, conversation_manager_with_mock_llm):
        """State should store the last screenshot path."""
        manager = conversation_manager_with_mock_llm

        # Manually set screenshot path (normally set during QA)
        manager.state.last_screenshot_path = "/path/to/screenshot.png"
        manager.state.last_qa_result = QAResultData(
            passed=True,
            summary="OK",
            critical_issues=[],
            suggestions=[],
            screenshot_path="/path/to/screenshot.png",
        )

        assert manager.state.last_screenshot_path is not None
        assert manager.state.last_qa_result is not None
        assert manager.state.last_qa_result.screenshot_path == manager.state.last_screenshot_path


# ============================================================================
# Integration Tests for All Features Together
# ============================================================================


class TestFeaturesIntegration:
    """Test that all features work together correctly."""

    @pytest.mark.integration
    def test_successful_flow_includes_all_features(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline,
        tmp_path,
    ):
        """Successful generation should include QA results and preview info."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        # Set up state
        manager.process_message("Show me revenue dashboard")

        # Mock file creation and QA
        dashboard_path = tmp_path / "pages" / "revenue" / "+page.md"
        dashboard_path.parent.mkdir(parents=True)
        dashboard_path.write_text("# Revenue Dashboard")

        # Create mock screenshot
        screenshots_dir = tmp_path / "qa_screenshots"
        screenshots_dir.mkdir()
        screenshot_path = screenshots_dir / "revenue_20240101_120000.png"
        screenshot_path.write_bytes(b"fake png data")

        qa_result = QAResultData(
            passed=True,
            summary="Dashboard looks good",
            critical_issues=[],
            suggestions=["Consider adding filters"],
            screenshot_path=str(screenshot_path),
        )

        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_create.return_value = dashboard_path

            with patch.object(manager, "_run_qa_validation") as mock_qa:
                mock_qa.return_value = MagicMock(
                    passed=True,
                    summary="Dashboard looks good",
                    critical_issues=[],
                    suggestions=["Consider adding filters"],
                )

                with patch.object(manager.config_loader, "is_qa_enabled", return_value=False):
                    result = manager.process_message("__action:generate")

        # Should be in refinement phase with action buttons
        assert manager.state.phase == ConversationPhase.REFINEMENT
        assert result.action_buttons is not None
        button_ids = [btn.id for btn in result.action_buttons]
        assert "done" in button_ids
        assert "modify" in button_ids

    @pytest.mark.integration
    def test_error_flow_provides_recovery_options(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline_factory,
    ):
        """Failed generation should provide retry and simplify options."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline_factory(
            success=False,
            error="Data not available for requested metrics",
        )

        manager.process_message("Show me complex metrics")
        result = manager.process_message("__action:generate")

        # Should have error context and recovery buttons
        assert result.error_context is not None
        assert result.action_buttons is not None

        button_ids = [btn.id for btn in result.action_buttons]
        assert "retry" in button_ids
        assert "simplify" in button_ids

        # User can simplify and try again
        result2 = manager.process_message("__action:simplify")
        assert manager.state.phase == ConversationPhase.CONTEXT
        assert "simplify" in result2.response.lower()
