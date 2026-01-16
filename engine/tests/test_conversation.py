"""Tests for conversation module and config loader."""

import pytest


class TestConfigLoader:
    """Test that config files load correctly."""

    def test_base_prompt_loads(self):
        """Ensure the base prompt loads from YAML."""
        from engine.config_loader import get_config_loader

        loader = get_config_loader()
        prompt = loader.get_base_prompt()

        assert len(prompt) > 0
        assert "data analyst" in prompt.lower() or "dashboard" in prompt.lower()

    def test_create_prompt_loads(self):
        """Ensure the create prompt loads from YAML."""
        from engine.config_loader import get_config_loader

        loader = get_config_loader()
        prompt = loader.get_create_prompt()

        assert len(prompt) > 0
        assert "PROPOSAL" in prompt or "create" in prompt.lower()

    def test_components_load(self):
        """Ensure Evidence components load from YAML."""
        from engine.config_loader import get_config_loader

        loader = get_config_loader()
        components = loader.get_components()

        assert "components" in components
        assert "LineChart" in components["components"]
        assert "BarChart" in components["components"]
        assert "DataTable" in components["components"]

    def test_dialect_loads(self):
        """Ensure SQL dialect rules load from YAML."""
        from engine.config_loader import get_config_loader

        loader = get_config_loader()
        dialect = loader.get_dialect("snowflake_saas")

        assert dialect.get("dialect") == "snowflake"
        assert "date_functions" in dialect
        assert "forbidden" in dialect["date_functions"]

    def test_qa_rules_load(self):
        """Ensure QA rules load from YAML."""
        from engine.config_loader import get_config_loader

        loader = get_config_loader()
        rules = loader.get_qa_rules()

        assert "validation" in rules
        assert "critical_issues" in rules
        assert "suggestions" in rules


class TestConversationManager:
    """Test ConversationManager with config-driven prompts."""

    def test_manager_initializes(self):
        """Ensure ConversationManager initializes with config loader."""
        from engine.conversation import ConversationManager

        manager = ConversationManager()
        assert manager.config_loader is not None

    def test_system_prompt_contains_dialect_rules(self):
        """Ensure system prompt includes SQL dialect rules."""
        from engine.conversation import ConversationManager

        manager = ConversationManager()
        prompt = manager.get_system_prompt()

        # Should contain dialect rules
        assert "SQL RULES" in prompt or "snowflake" in prompt.lower()

    def test_system_prompt_contains_components(self):
        """Ensure system prompt includes component documentation."""
        from engine.conversation import ConversationManager

        manager = ConversationManager()
        prompt = manager.get_system_prompt()

        # Should contain component docs
        assert "LineChart" in prompt or "BarChart" in prompt

    def test_system_prompt_contains_proposal_rules(self):
        """Ensure system prompt includes proposal rules for create mode."""
        from engine.conversation import ConversationManager

        manager = ConversationManager()
        prompt = manager.get_system_prompt()

        # Should mention proposals
        assert "PROPOSAL" in prompt or "create" in prompt.lower()


class TestQAModule:
    """Test QA module with config-driven prompts."""

    def test_qa_initializes(self):
        """Ensure DashboardQA initializes with config loader."""
        from engine.qa import DashboardQA

        qa = DashboardQA()
        assert qa.config_loader is not None

    def test_validation_prompt_uses_config(self):
        """Ensure validation prompt is built from config."""
        from engine.qa import DashboardQA

        qa = DashboardQA()
        prompt = qa._build_validation_prompt("Test request", None)

        assert "Test request" in prompt
        assert "CRITICAL" in prompt
        assert "SUGGESTIONS" in prompt
