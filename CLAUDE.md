# Claude Code Project Instructions

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
Story Analytics is a dashboard creation tool that combines:
- **Evidence** (npm-based BI framework) for rendering dashboards
- **Python conversation engine** for creating dashboards via natural language

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

Test data from Snowflake is committed to the repo at `.evidence/template/static/data/snowflake_saas/`. This allows the app to run **without Snowflake access** (e.g., Claude Code sandbox, mobile testing). The cached data includes: customers, events, invoices, subscriptions, users.

To refresh the cache from Snowflake (requires credentials): `npm run sources`

## Setup Steps (Run These When Starting Development)

When the user wants to develop or test, run these commands:

1. **Install npm dependencies** (if node_modules is missing):
   ```bash
   npm install
   ```

2. **Install Python dependencies** (if needed):
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

3. **Generate source data from Snowflake** (optional for remote testing - cached data exists):
   ```bash
   npm run sources
   ```

4. **Start the Evidence dev server**:
   ```bash
   npm run dev
   ```
   This opens the dashboard at http://localhost:3000

5. **Start the conversation engine** (in a separate terminal):
   ```bash
   python -m engine
   ```
   Credentials are loaded from `.env` file (see Environment Setup above).

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
├── components/        # UI component definitions
│   └── evidence.yaml  # Evidence component reference
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
- Edit `engine/components/evidence.yaml` for component documentation

## Common Issues

- **"Timeout while initializing database"**: Run `npm run sources` to regenerate source data
- **Python dotenv conflict**: package.json uses `npx dotenv-cli` to avoid conda conflicts
- **Evidence CLI not found**: Run `npm install`
- **SQL errors**: Check `sources/{source}/dialect.yaml` for allowed/forbidden functions
