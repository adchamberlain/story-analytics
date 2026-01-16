# Claude Code Project Instructions

## Project Overview
Story Analytics is a dashboard creation tool that combines:
- **Evidence** (npm-based BI framework) for rendering dashboards
- **Python conversation engine** for creating dashboards via natural language

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

3. **Generate source data from Snowflake**:
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
   Requires `ANTHROPIC_API_KEY` environment variable.

## QA Validation Feature

The engine includes automatic QA validation that:
1. Takes a screenshot of the generated dashboard using Playwright
2. Sends the screenshot to Claude's vision API
3. Validates the dashboard matches the original request
4. Reports any issues or suggestions

This runs automatically after each dashboard is created.

## Snowflake Connection

The Snowflake connection file is at `sources/snowflake_saas/connection.yaml` (gitignored).

Account identifier: `abebbgm-jxb85658`
Database: `ANALYTICS_POC`
Warehouse: `COMPUTE_WH`
Schema: `SAAS_DEMO`

If the connection file is missing, copy from `connection.yaml.example` and add credentials.

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
