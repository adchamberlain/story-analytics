# Chart Testing Guide for Claude Code

This document provides instructions for automated testing of the chart creation pipeline.

## Quick Start

```bash
# Run smoke tests (3 basic tests, ~2 min)
python tests/comprehensive_chart_tests.py --smoke --provider claude

# Run full test suite (10 tests, ~10 min)
python tests/comprehensive_chart_tests.py --provider claude

# Run with auto-start server
python tests/comprehensive_chart_tests.py --auto-start --provider claude
```

## Prerequisites

Before running tests, ensure:

1. **Evidence server is running**: `npm run dev` (port 3000)
2. **API keys are set**: `ANTHROPIC_API_KEY` in `.env`
3. **Dependencies installed**: `pip install -r requirements.txt && playwright install chromium`

Check prerequisites programmatically:
```bash
python tests/test_runner.py
```

## Test Architecture

### Layered Testing Strategy

```
Level 1: Unit Tests (no LLM, <1s)
├── tests/test_chart_models.py
├── Tests: serialization, config building, markdown generation
└── Run: pytest tests/test_chart_models.py -v

Level 2: Component Tests (targeted LLM calls, ~30s)
├── tests/test_pipeline_components.py
├── Tests: ChartRequirementsAgent, ChartSQLAgent independently
└── Run: pytest tests/test_pipeline_components.py -v

Level 3: Smoke Tests (3 E2E tests, ~2 min)
├── tests/comprehensive_chart_tests.py --smoke
├── Tests: bar chart, line chart, KPI
└── Run after code changes

Level 4: Full Suite (10 E2E tests, ~10 min)
├── tests/comprehensive_chart_tests.py
├── Tests: all chart types, filters, complex requests
└── Run before releases
```

## Test Cases

| # | Test Name | Complexity | What It Tests |
|---|-----------|------------|---------------|
| 1 | Simple Bar Chart | Simple | Basic aggregation, bar rendering |
| 2 | Time Series Line | Simple | Monthly aggregation, line chart |
| 3 | Multi-Line + Filter | Medium | Multiple metrics, date filter |
| 4 | KPI Big Value | Simple | BigValue component, single metric |
| 5 | Area Chart | Medium | Area chart, time series |
| 6 | Dual Y-Axis Bar | Medium | Two metrics with different scales |
| 7 | Dropdown Filter | Medium | Year dropdown, dynamic filtering |
| 8 | Horizontal Bar | Simple | swapXY prop, top N |
| 9 | Multi-Metric Line | Complex | Two line series, comparison |
| 10 | Complex Filtered | Complex | Weekly data, date filter, derived metric |

## Interpreting Results

### Pass Rates
- **100%**: All working, ready for release
- **90%+**: Good, minor issues to investigate
- **70-89%**: Some bugs found, fix before release
- **<70%**: Major issues, investigate immediately

### Common Failure Patterns

1. **Infrastructure (🔌)**: Server not running
   - Fix: `npm run dev` before tests

2. **SQL Validation Failed**: Template variable syntax error
   - Check: `engine/sql_validator.py` handles new patterns

3. **Blank Chart**: Data or filter issue
   - Check: Generated markdown in `.evidence/template/src/pages/`

4. **QA Vision Fails**: Chart renders but validation fails
   - Check: Validation criteria in test case may be too strict

## Adding New Tests

Add to `TEST_CASES` in `tests/comprehensive_chart_tests.py`:

```python
{
    "id": "11_new_test",
    "name": "New Test Name",
    "complexity": "Medium",
    "chart_type": "LineChart",
    "features": ["feature1", "feature2"],
    "request": "User request to test",
    "validation_criteria": [
        "Criterion 1",
        "Criterion 2",
    ],
    "smoke": False,  # Set True to include in smoke tests
}
```

## Iteration Workflow

When fixing bugs found by tests:

1. **Run failing test in isolation**:
   ```bash
   python -c "
   from engine.chart_conversation import ChartConversationManager
   manager = ChartConversationManager(provider_name='claude')
   response = manager.process_message('YOUR_TEST_REQUEST')
   print(response)
   "
   ```

2. **Check generated output**:
   - Screenshots: `qa_screenshots/`
   - Markdown: `.evidence/template/src/pages/{slug}/+page.md`
   - Test report: `test_results/comprehensive_test_results_*.md`

3. **Fix the issue** (common locations):
   - Prompts: `engine/prompts/chart/`
   - Models: `engine/models/chart.py`
   - Pipeline: `engine/chart_pipeline.py`
   - Validators: `engine/validators/`

4. **Re-run smoke tests** to verify fix doesn't break other tests

5. **Run full suite** before committing

## Known Issues

### Test 7 (Dropdown Filter)
Evidence's dropdown may not correctly pass selected values to SQL queries.
The `${inputs.filter_name.column}` syntax is required but may have rendering issues.

Workaround: Test passes intermittently. If consistently failing, check:
- Evidence version compatibility
- Dropdown `value` prop matches SQL column access

## Files Reference

```
tests/
├── comprehensive_chart_tests.py  # Main E2E test suite
├── test_runner.py                # Infrastructure checks
├── test_chart_models.py          # Unit tests (no LLM)
├── test_pipeline_components.py   # Component tests
├── test_validators.py            # Validator tests
└── TESTING.md                    # This file

test_results/
└── comprehensive_test_results_YYYY-MM-DD.md  # Test reports

qa_screenshots/
├── comprehensive_tests/          # E2E test screenshots
└── {dashboard-slug}_*.png        # Individual screenshots
```

## Running Tests in CI

```bash
# Start server in background
npm run dev &
sleep 10

# Run tests
python tests/comprehensive_chart_tests.py --provider claude

# Check exit code (0 = all passed, 1 = some failed)
```
