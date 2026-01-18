"""
Integration tests for the dashboard generation pipeline.

These tests use mocked LLM responses to verify pipeline orchestration
without making real API calls.
"""

import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path


# ============================================================================
# Pipeline Flow Tests
# ============================================================================


class TestPipelineFlow:
    """Test the complete pipeline flow with mocked components."""

    @pytest.mark.integration
    def test_successful_pipeline_creates_dashboard(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline,
        tmp_path,
    ):
        """Successful pipeline should create a dashboard file."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        # Set up state
        manager.process_message("Show me monthly revenue")

        # Mock file creation
        dashboard_path = tmp_path / "pages" / "revenue" / "+page.md"
        dashboard_path.parent.mkdir(parents=True)

        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_create.return_value = dashboard_path
            dashboard_path.write_text("# Revenue Dashboard")

            with patch.object(manager, "_run_qa_validation", return_value=None):
                result = manager.process_message("__action:generate")

        assert "created" in result.response.lower() or "Dashboard" in result.response
        assert manager.state.phase.value == "refinement"

    @pytest.mark.integration
    def test_failed_pipeline_shows_error(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline_factory,
    ):
        """Failed pipeline should show error message and stay actionable."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline_factory(
            success=False,
            error="SQL validation failed: column 'foo' not found",
        )

        # Set up state
        manager.process_message("Show me foo metrics")

        result = manager.process_message("__action:generate")

        assert "failed" in result.response.lower() or "error" in result.response.lower()

    @pytest.mark.integration
    def test_infeasible_request_shows_alternatives(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline_factory,
    ):
        """Infeasible request should show what's possible instead."""
        from engine.tests.conftest import MockFeasibilityResult

        pipeline = mock_pipeline_factory(success=False)
        pipeline.run.return_value.feasibility_result = MockFeasibilityResult(
            feasible=False,
            fully_feasible=False,
            explanation="The requested data is not available",
            infeasible_parts=["Customer lifetime value", "Churn prediction"],
            suggested_alternative="I can show you current subscription metrics instead",
        )

        manager = conversation_manager_with_mock_llm
        manager._pipeline = pipeline

        manager.process_message("Show me CLV and churn prediction")
        result = manager.process_message("__action:generate")

        assert "not available" in result.response.lower() or "cannot" in result.response.lower()


# ============================================================================
# QA Integration Tests
# ============================================================================


class TestQAIntegration:
    """Test QA validation integration with conversation flow."""

    @pytest.mark.integration
    def test_qa_results_shown_in_response(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline,
        tmp_path,
    ):
        """QA results should be included in the response."""
        from engine.qa import QAResult

        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        manager.process_message("Show me revenue")

        dashboard_path = tmp_path / "pages" / "test" / "+page.md"
        dashboard_path.parent.mkdir(parents=True)
        dashboard_path.write_text("# Test")

        qa_result = QAResult(
            passed=True,
            summary="Dashboard looks good",
            critical_issues=[],
            suggestions=["Consider adding a date filter"],
        )

        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_create.return_value = dashboard_path

            with patch.object(manager, "_run_qa_validation", return_value=qa_result):
                result = manager.process_message("__action:generate")

        assert "QA" in result.response
        assert "date filter" in result.response

    @pytest.mark.integration
    def test_critical_issues_flagged_clearly(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline,
        tmp_path,
    ):
        """Critical QA issues should be clearly flagged."""
        from engine.qa import QAResult

        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        manager.process_message("Show me revenue")

        dashboard_path = tmp_path / "pages" / "test" / "+page.md"
        dashboard_path.parent.mkdir(parents=True)
        dashboard_path.write_text("# Test")

        qa_result = QAResult(
            passed=False,
            summary="Dashboard has issues",
            critical_issues=["Chart shows no data", "Format error: $,1234.0f visible"],
            suggestions=[],
        )

        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_create.return_value = dashboard_path

            with patch.object(manager, "_run_qa_validation", return_value=qa_result):
                with patch.object(manager.config_loader, "is_qa_enabled", return_value=True):
                    with patch.object(manager.config_loader, "should_auto_fix_critical", return_value=False):
                        result = manager.process_message("__action:generate")

        assert "issues" in result.response.lower() or "critical" in result.response.lower()


# ============================================================================
# Refinement Integration Tests
# ============================================================================


class TestRefinementIntegration:
    """Test the refinement phase integration."""

    @pytest.mark.integration
    def test_refinement_updates_file(
        self,
        conversation_manager_factory,
        tmp_path,
    ):
        """Refinement should update the dashboard file."""
        # Create manager with mock that returns updated markdown
        updated_markdown = """# Updated Dashboard

```sql revenue
SELECT date, SUM(amount) as revenue FROM invoices GROUP BY date
```

<LineChart data={revenue} x="date" y="revenue" title="Updated Chart" />
"""
        manager = conversation_manager_factory([updated_markdown])
        manager.state.phase.value  # Access to ensure it's initialized

        # Set up refinement state
        from engine.conversation import ConversationPhase

        manager.state.phase = ConversationPhase.REFINEMENT

        dashboard_path = tmp_path / "pages" / "test" / "+page.md"
        dashboard_path.parent.mkdir(parents=True)
        dashboard_path.write_text("# Original Dashboard\n...")
        manager.state.created_file = dashboard_path
        manager.state.generated_markdown = "# Original"

        result = manager.process_message("Change the chart title to Updated Chart")

        # File should be updated
        content = dashboard_path.read_text()
        assert "Updated" in content or "updated" in result.response.lower()


# ============================================================================
# Edit Mode Integration Tests
# ============================================================================


class TestEditModeIntegration:
    """Test edit mode for existing dashboards."""

    @pytest.mark.integration
    def test_edit_existing_lists_dashboards(
        self,
        conversation_manager_with_mock_llm,
    ):
        """Edit action should list available dashboards."""
        manager = conversation_manager_with_mock_llm

        # Mock parser to return some dashboards
        mock_summaries = [
            {"title": "Revenue Dashboard", "file": "revenue"},
            {"title": "Customer Metrics", "file": "customers"},
        ]

        with patch.object(manager.parser, "get_dashboard_summaries", return_value=mock_summaries):
            result = manager.process_message("__action:edit_existing")

        assert "Revenue Dashboard" in result.response
        assert "Customer Metrics" in result.response

    @pytest.mark.integration
    def test_edit_existing_no_dashboards_redirects_to_create(
        self,
        conversation_manager_with_mock_llm,
    ):
        """Edit with no dashboards should redirect to create."""
        manager = conversation_manager_with_mock_llm

        with patch.object(manager.parser, "get_dashboard_summaries", return_value=[]):
            result = manager.process_message("__action:edit_existing")

        assert "no existing" in result.response.lower() or "create" in result.response.lower()
        from engine.conversation import ConversationPhase
        assert manager.state.phase == ConversationPhase.CONTEXT
        assert manager.state.intent == "create"


# ============================================================================
# Error Handling Tests
# ============================================================================


class TestErrorHandling:
    """Test error handling throughout the pipeline."""

    @pytest.mark.integration
    def test_file_creation_error_handled(
        self,
        conversation_manager_with_mock_llm,
        mock_pipeline,
    ):
        """File creation errors should be handled gracefully."""
        manager = conversation_manager_with_mock_llm
        manager._pipeline = mock_pipeline

        manager.process_message("Show me revenue")

        with patch("engine.conversation.create_dashboard_from_markdown") as mock_create:
            mock_create.side_effect = PermissionError("Cannot write file")

            result = manager.process_message("__action:generate")

        assert "error" in result.response.lower()

    @pytest.mark.integration
    def test_unknown_action_treated_as_message(
        self,
        conversation_manager_with_mock_llm,
    ):
        """Unknown action IDs should be treated as regular messages."""
        manager = conversation_manager_with_mock_llm
        manager.state.phase.value  # Ensure initialized

        result = manager.process_message("__action:unknown_action")

        # Should not crash, treated as regular input
        assert result.response is not None
