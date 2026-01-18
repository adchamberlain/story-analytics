"""
Pytest fixtures and configuration for Story Analytics tests.

This provides reusable fixtures for unit, integration, and e2e tests.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


# ============================================================================
# Mock LLM Fixtures
# ============================================================================


@dataclass
class MockLLMResponse:
    """Mock response from LLM provider."""
    content: str
    usage: dict | None = None


class MockLLMProvider:
    """Mock LLM provider for testing without API calls."""

    def __init__(self, responses: list[str] | None = None):
        """
        Initialize mock provider.

        Args:
            responses: List of responses to return in sequence.
                       If None, returns a default response.
        """
        self._responses = responses or ["This is a mock response."]
        self._call_count = 0
        self.calls: list[dict] = []  # Track all calls for assertions

    @property
    def name(self) -> str:
        return "mock"

    @property
    def model(self) -> str:
        return "mock-model"

    def generate(
        self,
        messages: list,
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> MockLLMResponse:
        """Return mock response and track the call."""
        self.calls.append({
            "messages": messages,
            "system_prompt": system_prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
        })

        # Cycle through responses
        response = self._responses[self._call_count % len(self._responses)]
        self._call_count += 1

        return MockLLMResponse(content=response)


@pytest.fixture
def mock_llm():
    """Provide a basic mock LLM provider."""
    return MockLLMProvider()


@pytest.fixture
def mock_llm_factory():
    """Factory to create mock LLM with custom responses."""
    def _create(responses: list[str]) -> MockLLMProvider:
        return MockLLMProvider(responses=responses)
    return _create


# ============================================================================
# Conversation Manager Fixtures
# ============================================================================


@pytest.fixture
def mock_schema_context():
    """Mock schema context to avoid database calls."""
    return """
Available Tables:
- customers (id, name, email, created_at, plan_type)
- subscriptions (id, customer_id, plan, mrr, start_date, end_date, status)
- invoices (id, customer_id, amount, status, created_at)
- events (id, customer_id, event_type, timestamp)
"""


@pytest.fixture
def conversation_manager_with_mock_llm(mock_llm, mock_schema_context):
    """Create ConversationManager with mocked LLM and schema."""
    from engine.conversation import ConversationManager

    with patch("engine.conversation.get_provider") as mock_get_provider, \
         patch("engine.conversation.get_schema_context") as mock_get_schema:
        mock_get_provider.return_value = mock_llm
        mock_get_schema.return_value = mock_schema_context

        manager = ConversationManager()
        manager.llm = mock_llm  # Ensure mock is used
        manager._schema_context = mock_schema_context

        yield manager


@pytest.fixture
def conversation_manager_factory(mock_schema_context):
    """Factory to create ConversationManager with custom mock responses."""
    def _create(llm_responses: list[str]) -> "ConversationManager":
        from engine.conversation import ConversationManager

        mock_llm = MockLLMProvider(responses=llm_responses)

        with patch("engine.conversation.get_provider") as mock_get_provider, \
             patch("engine.conversation.get_schema_context") as mock_get_schema:
            mock_get_provider.return_value = mock_llm
            mock_get_schema.return_value = mock_schema_context

            manager = ConversationManager()
            manager.llm = mock_llm
            manager._schema_context = mock_schema_context

            return manager

    return _create


# ============================================================================
# Pipeline Fixtures
# ============================================================================


@dataclass
class MockDashboardSpec:
    """Mock dashboard specification from requirements agent."""
    title: str = "Test Dashboard"
    business_question: str = "How are we doing?"
    target_audience: str = "Analysts"
    metrics: list = None
    dimensions: list = None
    filters: list = None
    visualizations: list = None

    def __post_init__(self):
        self.metrics = self.metrics or ["revenue", "customers"]
        self.dimensions = self.dimensions or ["date", "plan"]
        self.filters = self.filters or []
        self.visualizations = self.visualizations or ["line_chart", "bar_chart"]


@dataclass
class MockValidatedQueries:
    """Mock validated queries from SQL agent."""
    queries: dict = None

    def __post_init__(self):
        self.queries = self.queries or {
            "revenue_over_time": "SELECT date, SUM(amount) as revenue FROM invoices GROUP BY date",
            "customers_by_plan": "SELECT plan, COUNT(*) as count FROM customers GROUP BY plan",
        }


@dataclass
class MockFeasibilityResult:
    """Mock feasibility check result."""
    feasible: bool = True
    fully_feasible: bool = True
    explanation: str = "All requested data is available"
    feasible_parts: list = None
    infeasible_parts: list = None
    suggested_alternative: str | None = None


@dataclass
class MockPipelineResult:
    """Mock pipeline result."""
    success: bool = True
    markdown: str = "# Test Dashboard\n\n```sql test\nSELECT 1\n```\n\n<BigValue data={test} value=count />"
    error: str | None = None
    dashboard_spec: MockDashboardSpec = None
    validated_queries: MockValidatedQueries = None
    feasibility_result: MockFeasibilityResult = None


@pytest.fixture
def mock_pipeline():
    """Create a mock pipeline that returns success."""
    pipeline = MagicMock()
    pipeline.run.return_value = MockPipelineResult(
        dashboard_spec=MockDashboardSpec(),
        validated_queries=MockValidatedQueries(),
        feasibility_result=MockFeasibilityResult(),
    )
    return pipeline


@pytest.fixture
def mock_pipeline_factory():
    """Factory to create mock pipeline with custom results."""
    def _create(
        success: bool = True,
        markdown: str | None = None,
        error: str | None = None,
    ) -> MagicMock:
        pipeline = MagicMock()
        result = MockPipelineResult(
            success=success,
            markdown=markdown or "# Test\n```sql q\nSELECT 1\n```",
            error=error,
            dashboard_spec=MockDashboardSpec(),
            validated_queries=MockValidatedQueries(),
            feasibility_result=MockFeasibilityResult(feasible=success),
        )
        pipeline.run.return_value = result
        return pipeline

    return _create


# ============================================================================
# File System Fixtures
# ============================================================================


@pytest.fixture
def temp_pages_dir(tmp_path):
    """Create a temporary pages directory for dashboard tests."""
    pages_dir = tmp_path / "pages"
    pages_dir.mkdir()
    return pages_dir


@pytest.fixture
def sample_dashboard_markdown():
    """Sample dashboard markdown for testing."""
    return '''# Monthly Revenue Dashboard

```sql revenue_trend
SELECT
    DATE_TRUNC('month', created_at) as month,
    SUM(amount) as revenue
FROM invoices
WHERE status = 'paid'
GROUP BY 1
ORDER BY 1
```

```sql top_customers
SELECT
    c.name,
    SUM(i.amount) as total_spent
FROM customers c
JOIN invoices i ON c.id = i.customer_id
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10
```

## Revenue Trend

<LineChart
    data={revenue_trend}
    x="month"
    y="revenue"
    title="Monthly Revenue"
/>

## Top Customers

<DataTable data={top_customers} />
'''


@pytest.fixture
def sample_dashboard_file(temp_pages_dir, sample_dashboard_markdown):
    """Create a sample dashboard file."""
    dashboard_dir = temp_pages_dir / "monthly-revenue"
    dashboard_dir.mkdir()
    dashboard_file = dashboard_dir / "+page.md"
    dashboard_file.write_text(sample_dashboard_markdown)
    return dashboard_file


# ============================================================================
# Config Fixtures
# ============================================================================


@pytest.fixture
def config_loader():
    """Get the real config loader for testing config files."""
    from engine.config_loader import get_config_loader
    return get_config_loader()


# ============================================================================
# Markers
# ============================================================================


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "unit: Fast unit tests with no external deps")
    config.addinivalue_line("markers", "integration: Tests using mocked external services")
    config.addinivalue_line("markers", "e2e: End-to-end tests with real LLM calls")
    config.addinivalue_line("markers", "slow: Tests taking more than 5 seconds")
