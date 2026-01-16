# Story Analytics - Project Status

Conversational AI dashboard builder using Evidence.dev + Claude.

## What's Built

### 1. Snowflake Connection
- **Database**: `ANALYTICS_POC.SAAS_DEMO` on Snowflake
- **Demo tables**: customers (200), users (1000), subscriptions (200), events (10000), invoices (~1800)
- **Connection**: `sources/snowflake_saas/connection.yaml` (gitignored, contains credentials)

### 2. LLM Conversation Engine (`engine/`)
- **CLI**: `python -m engine` - conversational dashboard builder
- **Conversation flow**: Intent → Context → Data Discovery → Generation → Refinement
- **Features**:
  - Create new dashboards via natural language
  - Edit existing dashboards
  - Schema introspection (auto-discovers tables/columns from Snowflake)
  - Writes Evidence markdown files to `pages/`

**Key files:**
- `engine/cli.py` - Rich terminal interface
- `engine/conversation.py` - Conversation state machine
- `engine/llm/claude.py` - Claude API integration
- `engine/schema.py` - Snowflake schema introspection
- `engine/generator.py` - Evidence markdown generation
- `engine/parser.py` - Parse existing dashboards

### 3. Datawrapper-Style Theming
- **Color palette** in `evidence.config.yaml` - muted, professional colors
- **Custom CSS** in `.evidence/template/src/app.css` - clean typography, minimal chrome
- **Brand system** - user-customizable fonts, colors, logo

**Brand customization:**
1. Edit `brand_config.yaml`
2. Place logo in `static/`
3. Run CLI and type `brand` to regenerate CSS

### 4. Sample Dashboards Created
- `pages/top-industries-by-plan-tier.md` - Customer signups over time
- `pages/customer-signups-dashboard.md` - (if created during testing)

## How to Run

```bash
# Start Evidence dev server
npm run dev

# Run conversation engine (separate terminal)
export ANTHROPIC_API_KEY='your-key'
python -m engine
```

**CLI Commands:**
- Type natural language to create/edit dashboards
- `list` - show existing dashboards
- `new` - start fresh conversation
- `brand` - apply brand_config.yaml changes
- `quit` - exit

## Configuration Files

| File | Purpose |
|------|---------|
| `evidence.config.yaml` | Evidence theme, colors, plugins |
| `engine_config.yaml` | LLM provider, Snowflake connection path |
| `brand_config.yaml` | User brand customization (colors, fonts, logo) |
| `sources/snowflake_saas/connection.yaml` | Snowflake credentials (gitignored) |

## Known Issues / Fixes Applied

1. **SQL generation**: LLM must use `FROM tablename` not `FROM database.schema.tablename` - fixed via system prompt
2. **New dashboard in refinement**: Added phrase detection for "create a new" to reset conversation state
3. **CSS import order**: `@import` must come before `@tailwind` directives

## What's Next

- [ ] Web UI - embed conversation interface in Evidence
- [ ] More chart types and layouts
- [ ] Dashboard templates
- [ ] Multi-user / permissions
- [ ] Scheduled data refreshes

## Dependencies

```
# Python (in requirements.txt)
anthropic>=0.18.0
pyyaml>=6.0
rich>=13.0
snowflake-connector-python

# Node (in package.json)
evidence + snowflake connector
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for conversation engine
