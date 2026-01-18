# Testing Strategy for Story Analytics

This document outlines the automated testing approach for Story Analytics.

## Test Pyramid

We use a three-tier testing pyramid optimized for AI-native applications:

```
        /\
       /  \      E2E Tests (Live LLM)
      /----\     - Golden path validation
     /      \    - Run sparingly (expensive)
    /--------\
   /          \  Integration Tests (Mocked LLM)
  /------------\ - Pipeline orchestration
 /              \- API endpoints
/----------------\- State persistence
       Unit Tests (No external deps)
       - Config loading
       - State machine logic
       - Parsing/formatting
```

## Running Tests

### Quick Start

```bash
# Run all unit tests (fast, no API calls)
pytest -m unit

# Run all tests except E2E
pytest -m "not e2e"

# Run all tests with coverage
pytest --cov=engine --cov=api --cov-report=html

# Run specific test file
pytest engine/tests/test_phase_transitions.py -v
```

### Test Markers

Tests are marked for selective execution:

| Marker | Description | Speed | API Calls |
|--------|-------------|-------|-----------|
| `unit` | Pure logic tests | Fast (<1s each) | None |
| `integration` | Mocked service tests | Medium (~1s) | None |
| `e2e` | Full system tests | Slow (5-30s) | Yes (LLM) |
| `slow` | Tests >5 seconds | Slow | Varies |

### Examples

```bash
# Run unit tests only (CI-friendly)
pytest -m unit -v

# Run everything except slow E2E tests
pytest -m "not e2e" -v

# Run integration tests with verbose output
pytest -m integration -v --tb=long

# Run with coverage report
pytest -m "not e2e" --cov=engine --cov-report=term-missing
```

## Test Categories

### 1. Unit Tests (`test_*.py` with `@pytest.mark.unit`)

Fast tests that verify individual components without external dependencies.

**What they test:**
- Phase transition logic (`test_phase_transitions.py`)
- Config file loading and validation
- Message parsing (clarifying questions, action buttons)
- State management
- Utility functions

**Example:**
```python
@pytest.mark.unit
def test_initial_phase_is_intent(conversation_manager_with_mock_llm):
    """New conversation should start in INTENT phase."""
    manager = conversation_manager_with_mock_llm
    assert manager.state.phase == ConversationPhase.INTENT
```

### 2. Integration Tests (`@pytest.mark.integration`)

Tests that verify component interactions using mocked LLM responses.

**What they test:**
- Pipeline orchestration (requirements → SQL → layout)
- Conversation flow across phases
- API endpoint request/response formats
- Database persistence
- QA validation integration

**Example:**
```python
@pytest.mark.integration
def test_successful_pipeline_creates_dashboard(
    conversation_manager_with_mock_llm,
    mock_pipeline,
    tmp_path,
):
    """Successful pipeline should create a dashboard file."""
    # ... test with mocked LLM and pipeline
```

### 3. E2E Tests (`@pytest.mark.e2e`)

Full system tests that make real LLM API calls. Run sparingly.

**What they test:**
- Golden path: user request → working dashboard
- QA validation accuracy
- Template feasibility
- Error recovery flows

**Considerations:**
- Expensive (API costs)
- Slow (network latency)
- Non-deterministic (LLM output varies)
- Run in CI only on PRs to main

## Test Fixtures

The `conftest.py` provides reusable fixtures:

### LLM Mocking

```python
# Basic mock LLM
def test_something(mock_llm):
    assert mock_llm.name == "mock"

# Custom responses
def test_with_responses(mock_llm_factory):
    mock = mock_llm_factory(["Response 1", "Response 2"])
```

### Conversation Manager

```python
# Manager with mocked LLM and schema
def test_manager(conversation_manager_with_mock_llm):
    result = manager.process_message("test")

# Factory for custom scenarios
def test_scenario(conversation_manager_factory):
    manager = conversation_manager_factory(["Custom LLM response"])
```

### Pipeline

```python
# Mock pipeline that succeeds
def test_pipeline(mock_pipeline):
    result = mock_pipeline.run("request")
    assert result.success

# Factory for failure scenarios
def test_failure(mock_pipeline_factory):
    pipeline = mock_pipeline_factory(success=False, error="Test error")
```

## Writing New Tests

### Guidelines

1. **Always use markers**: Tag tests with `@pytest.mark.unit`, `@pytest.mark.integration`, or `@pytest.mark.e2e`

2. **Mock external dependencies**: Use fixtures from `conftest.py` to avoid API calls in unit/integration tests

3. **Test behavior, not implementation**: Focus on what the code does, not how

4. **One assertion focus per test**: Each test should verify one specific behavior

5. **Descriptive names**: Test names should describe the scenario and expected outcome

### Adding a New Unit Test

```python
# engine/tests/test_my_feature.py
import pytest

class TestMyFeature:
    @pytest.mark.unit
    def test_feature_does_expected_thing(self, conversation_manager_with_mock_llm):
        """Feature should do X when Y happens."""
        manager = conversation_manager_with_mock_llm

        # Arrange
        manager.state.phase = ConversationPhase.CONTEXT

        # Act
        result = manager.process_message("test input")

        # Assert
        assert "expected" in result.response
```

### Adding an Integration Test

```python
@pytest.mark.integration
def test_api_integration(api_client, mock_conversation_manager):
    """API should return expected response format."""
    with patch("api.routers.conversation.ConversationManager") as mock:
        mock.return_value = mock_conversation_manager

        response = api_client.post("/api/conversation/message", json={...})

        assert response.status_code == 200
        assert "response" in response.json()
```

## CI/CD Integration

### Recommended CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - run: pip install -r requirements.txt pytest pytest-cov
      - run: pytest -m "unit" --cov=engine --cov-report=xml

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -r requirements.txt pytest
      - run: pytest -m "integration"

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' && github.base_ref == 'main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -r requirements.txt pytest playwright
      - run: playwright install chromium
      - run: pytest -m "e2e"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Test Data

### Sample Dashboard Markdown

Use the `sample_dashboard_markdown` fixture for tests that need dashboard content:

```python
def test_parsing(sample_dashboard_markdown):
    parser = DashboardParser()
    result = parser.parse_content(sample_dashboard_markdown)
    assert len(result.queries) == 2
```

### Mock Schema Context

The `mock_schema_context` fixture provides a minimal schema for testing:

```python
def test_with_schema(mock_schema_context):
    # Contains: customers, subscriptions, invoices, events tables
    assert "customers" in mock_schema_context
```

## Troubleshooting

### Tests Failing with Import Errors

Ensure you're running from the project root:
```bash
cd /path/to/story-analytics
pytest engine/tests/
```

### Tests Making Real API Calls

Check that you're using fixtures that mock the LLM:
- Use `conversation_manager_with_mock_llm` instead of `ConversationManager()`
- Use `mock_pipeline` instead of `DashboardPipeline()`

### Flaky E2E Tests

E2E tests may fail due to LLM non-determinism. Strategies:
- Use specific, constrained prompts
- Assert on structure rather than exact content
- Allow retries for network issues
- Skip in CI if not critical path
