# Prompt for Continuing Automated Testing

Copy and paste this prompt into a new Claude Code session to continue the testing iteration workflow.

---

I'm building an AI-native analytics product that creates charts via natural language. I have an automated testing system to find and fix bugs. Your job is to run tests, analyze failures, fix the underlying issues, and iterate until the pass rate improves.

## Key Files

- `tests/TESTING.md` - Full testing guide (read this first)
- `tests/comprehensive_chart_tests.py` - E2E test suite (10 test cases)
- `tests/run_tests.sh` - Quick test runner script
- `test_results/` - Test reports with screenshots and failure details
- `engine/prompts/chart/` - LLM prompts (requirements.yaml, sql.yaml)
- `engine/models/chart.py` - Chart models and Evidence markdown generation
- `engine/chart_pipeline.py` - Main pipeline logic
- `engine/validators/` - SQL validation, scale analysis, filter defaults

## Workflow

1. **Run smoke tests first**: `./tests/run_tests.sh smoke`
2. **If failures occur**: Check `test_results/comprehensive_test_results_*.md` for details
3. **Debug a failure**: Look at screenshots in `qa_screenshots/`, read generated markdown in `.evidence/template/src/pages/`
4. **Fix the issue**: Usually in prompts (yaml files) or models (chart.py)
5. **Re-run tests** to verify fix doesn't break other tests
6. **Run full suite** when smoke tests pass: `./tests/run_tests.sh full`

## Current Status

- Pass rate: 90% (9/10 tests)
- Failing: Test 7 (Dropdown Filter) - Evidence rendering issue with `${inputs.filter.column}` syntax
- Server must be running: `npm run dev`

## Goal

Get to 100% pass rate, then expand test coverage to catch more edge cases. When you find a pattern of failures, fix the root cause (usually prompt engineering or model serialization) rather than just the symptom.

Start by running the smoke tests and reporting what you find.
