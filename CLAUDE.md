# Claude Code Project Instructions

## Development Log Workflow (IMPORTANT)

**At the start of every session**, read `DEV_LOG.md` to understand:
- What was done in recent sessions
- Current project state and context
- Outstanding next steps

**At the end of every session**, update `DEV_LOG.md` with:
- Summary of work completed
- Files created or modified
- Decisions made and rationale
- Issues encountered and how they were resolved
- Next steps for future sessions

Also review `DEV_PLAN.md` for the current strategic direction and implementation phases.

---

## Design Philosophy: AI-Native

This app is intentionally AI-native. **Never use naive string/keyword matching** for intent detection or control flow. This includes:
- No regex or substring checks to detect user intent (e.g., `if "edit" in user_input`)
- No phrase lists to trigger actions (e.g., `["generate", "build it", "create"]`)
- No word count heuristics to determine input quality

Instead, always use:
1. **Explicit UI affordances** (buttons, modes) when user intent must be unambiguous
2. **LLM understanding** when natural language interpretation is genuinely needed

This is a rethinking of how analytics tools work—the LLM is the core, not a bolted-on feature.

**What works well:** The action button system for phase transitions (Generate/Modify Plan, Done/Modify) tested very well. Users click buttons to advance phases rather than typing magic words.

## Project Overview

Story Analytics is an AI-native dashboard creation tool:
- **React + Plotly.js** frontend for professional chart rendering
- **FastAPI** backend with render endpoints
- **Python conversation engine** for creating charts via natural language
- **DuckDB** for SQL validation and query execution

## Architecture

```
User Request → LLM Pipeline → Chart JSON → Storage
                                    ↓
                             React Frontend ← Render API
```

Charts are stored as JSON and rendered directly by React + Plotly.js. No markdown intermediary.

## Environment Setup (IMPORTANT for Remote/Mobile Sessions)

The `.env` file contains credentials and is gitignored. **At the start of any session**, check if `.env` exists:

```bash
test -f .env && echo "exists" || echo "missing"
```

If `.env` is missing, ask the user to provide credentials for the following required variables:
- `ANTHROPIC_API_KEY` (required for conversation engine)
- `SNOWFLAKE_USERNAME` (optional - test data is cached in repo)
- `SNOWFLAKE_PASSWORD` (optional - test data is cached in repo)

Then create `.env` based on `.env.example` with the provided values.

### Cached Test Data

Test data from Snowflake is committed to the repo at `data/snowflake_saas/`. This allows the app to run **without Snowflake access** (e.g., Claude Code sandbox, mobile testing). The cached data includes: customers, events, invoices, subscriptions, users.

## Setup Steps (Run These When Starting Development)

When the user wants to develop or test, run these commands:

1. **Install Python dependencies** (if needed):
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

2. **Install React app dependencies** (if node_modules is missing):
   ```bash
   cd app && npm install && cd ..
   ```

3. **Start the dev server**:
   ```bash
   ./dev.sh
   ```
   This starts:
   - API server on http://localhost:8000
   - React app on http://localhost:3001

## QA Validation Feature

The engine includes automatic QA validation that:
1. Takes a screenshot of the generated dashboard using Playwright
2. Sends the screenshot to Claude's vision API
3. Validates the dashboard matches the original request
4. Reports any issues or suggestions

This runs automatically after each dashboard is created.

## Snowflake Connection

The Snowflake connection file is at `sources/snowflake_saas/connection.yaml` (gitignored).
Credentials use `${VAR}` syntax to load from `.env` file.

Account identifier: `abebbgm-jxb85658`
Database: `ANALYTICS_POC`
Warehouse: `COMPUTE_WH`
Schema: `SAAS_DEMO`

If connection issues occur, ensure `SNOWFLAKE_USERNAME` and `SNOWFLAKE_PASSWORD` are set in `.env`.

## Configuration-Driven Architecture

The engine uses YAML config files for customization without code changes:

```
engine/
├── prompts/           # LLM prompt templates
│   ├── base.yaml      # Base system prompt
│   ├── create.yaml    # Dashboard creation prompts
│   ├── edit.yaml      # Dashboard editing prompts
│   └── generate.yaml  # Generation prompts
├── qa/                # QA validation rules
│   └── rules.yaml     # Critical issues vs suggestions
└── config_loader.py   # Loads all YAML configs

sources/
└── {source_name}/
    ├── connection.yaml  # Database credentials
    └── dialect.yaml     # SQL dialect rules for this source
```

To customize behavior:
- Edit YAML files in `engine/prompts/` for prompt changes
- Edit `sources/{source}/dialect.yaml` for SQL rules per database
- Edit `engine/qa/rules.yaml` for QA behavior

## Testing Workflow

**IMPORTANT:** When running ANY automated tests (chart pipeline, suggested charts, end-to-end tests, etc.), **always update `test_results/TESTING_LOG.md`** with the results.

### Before Testing

1. **Read the log first**: `test_results/TESTING_LOG.md`
   - Check which tests have been run recently
   - Review any outstanding issues or next steps
   - Understand what fixes have already been applied

### Running Tests

2. **Comprehensive chart tests**: `python tests/comprehensive_chart_tests.py --provider <provider>`
   - Use `--smoke` for quick 3-test validation
   - Use `--provider claude|openai|gemini` for specific provider
   - Full suite is 30 tests across all chart types and edge cases

3. **Suggested charts test**: `python test_suggested_charts.py`
   - Tests all 12 suggested charts from semantic layers (6 per source)
   - Includes visual QA validation with Playwright screenshots
   - Generates HTML report at `test_results/SUGGESTED_CHARTS_QA_REPORT.html`

### After Testing (REQUIRED)

4. **Update the log** after EVERY testing session:
   - Record test suite name, date, and results (pass rate, failing tests)
   - Document issues identified (symptoms, root causes)
   - Record fixes applied (with code snippets)
   - Record re-test results and improvement metrics
   - Note any test coverage gaps discovered

5. **Test results are stored in**: `test_results/`
   - `TESTING_LOG.md` - Consolidated progress log (use this!)
   - `SUGGESTED_CHARTS_QA_REPORT.html` - Visual QA report with screenshots
   - `suggested_chart_screenshots/` - Screenshot images

This ensures continuity across sessions and tracks progress. Without updating the log, we lose context on what was tested and what issues were found.

## Common Issues

- **SQL errors**: Check `sources/{source}/dialect.yaml` for allowed/forbidden functions
- **Chart not rendering**: Check browser console for errors, verify API is running
- **Auth issues**: Clear localStorage and re-login
