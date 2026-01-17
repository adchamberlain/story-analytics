# Story Analytics - Project Status

Conversational AI dashboard builder using Evidence.dev + Claude/OpenAI/Gemini.

## What's Built

### 1. Web Application

#### FastAPI Backend (`api/`)
- **Authentication**: Passwordless magic link authentication via email
- **Database**: SQLAlchemy with SQLite (`story_analytics.db`)
- **Models**: User, ConversationSession, Dashboard, QAHistory
- **Endpoints**:
  - `POST /auth/request-magic-link` - Send login email
  - `GET /auth/verify` - Verify magic link token
  - `POST /conversation/message` - Send message, get response
  - `GET /conversation/list` - List all conversations
  - `POST /conversation/new` - Start new conversation
  - `PATCH /conversation/{id}` - Rename conversation
  - `DELETE /conversation/{id}` - Delete conversation
  - `GET /dashboards` - List user's dashboards
  - `GET /dashboards/{slug}` - Get dashboard details
  - `GET /dashboards/{slug}/content` - Get dashboard markdown
  - `PUT /dashboards/{slug}/content` - Update dashboard markdown
  - `DELETE /dashboards/{slug}` - Delete dashboard

#### SvelteKit Frontend (`frontend/`)
- **Auth flow**: Login/register with magic links
- **Chat UI**: Conversation interface with message history
- **Conversation sidebar**: List, rename, delete conversations
- **Dashboard list**: View, edit, delete dashboards
- **Split-pane editor**: Side-by-side markdown editing with live preview
- **Settings page**: LLM provider selection (Claude, OpenAI, Gemini)
- **State management**: Svelte stores for auth, conversations, messages

### 2. LLM Conversation Engine (`engine/`)
- **Conversation flow**: Intent → Generation → Refinement
- **Multi-provider support**: Claude, OpenAI, Gemini (user-selectable)
- **Features**:
  - Create dashboards via natural language
  - Edit/refine existing dashboards
  - Schema introspection from Snowflake
  - SQL pre-validation against DuckDB
  - Automatic format string fixing
  - LLM-generated conversation titles

**Key files:**
- `engine/conversation.py` - Conversation state machine
- `engine/llm/claude.py` - Claude API integration
- `engine/llm/openai_provider.py` - OpenAI integration
- `engine/llm/gemini_provider.py` - Gemini integration (gemini-2.0-flash)
- `engine/schema.py` - Snowflake schema introspection
- `engine/generator.py` - Evidence markdown generation
- `engine/sql_validator.py` - DuckDB SQL pre-validation
- `engine/qa.py` - Screenshot-based QA validation

### 3. QA Validation System (`engine/qa.py`)
- **Screenshot capture**: Playwright takes dashboard screenshots
- **Vision analysis**: Uses user's selected LLM provider for validation
- **Auto-fix**: Automatically fixes critical issues (up to 2 attempts)
- **Issue categorization**: Critical issues vs suggestions
- **Format detection**: Catches formatting errors like "$,1290507.0f"
- **Provider consistency**: QA uses same provider as dashboard generation

### 4. SQL Pre-Validation (`engine/sql_validator.py`)
- **DuckDB testing**: Validates SQL before writing dashboards
- **Error detection**: Catches syntax errors, missing columns, bad functions
- **Auto-fix loop**: LLM fixes SQL errors (up to 3 attempts)
- **Dialect enforcement**: Prevents Snowflake-specific SQL in Evidence
- **Semicolon handling**: Strips trailing semicolons to avoid subquery errors

### 5. Configuration-Driven Architecture

```
engine/
├── prompts/           # LLM prompt templates
│   ├── base.yaml      # Base system prompt + DuckDB SQL rules
│   ├── create.yaml    # Dashboard creation prompts
│   ├── edit.yaml      # Dashboard editing prompts
│   └── generate.yaml  # Generation prompts + forbidden SQL functions
├── components/        # UI component definitions
│   └── evidence.yaml  # Evidence component reference
├── qa/                # QA validation rules
│   └── rules.yaml     # Critical issues vs suggestions
└── config_loader.py   # Loads all YAML configs

sources/
└── snowflake_saas/
    ├── connection.yaml  # Database credentials (gitignored)
    └── dialect.yaml     # DuckDB SQL rules
```

### 6. Snowflake Connection
- **Database**: `ANALYTICS_POC.SAAS_DEMO` on Snowflake
- **Demo tables**: customers (200), users (1000), subscriptions (200), events (10000), invoices (~1800)
- **Connection**: `sources/snowflake_saas/connection.yaml` (gitignored)

### 7. Story Branding
- **Favicon**: Blue cursor icon (matches blinking cursor in logo)
- **Browser title**: "Story" across all pages
- **Slogan**: "AI-native analytics."
- **Color palette**: Brand blue (#7c9eff) throughout
- **Terminal aesthetic**: Monospace fonts, dark theme

### 8. Dashboard Features
- **View Source link**: Links from dashboard pages to split-pane editor
- **Split-pane editor**: Edit markdown with live preview side-by-side
- **AI-assisted editing**: Chat-based dashboard modifications
- **Manual editing**: Direct markdown editing option

## How to Run

### Backend + Frontend (Web App)
```bash
# Terminal 1: Start FastAPI backend
cd api
uvicorn main:app --reload --port 8000

# Terminal 2: Start SvelteKit frontend
cd frontend
npm run dev

# Terminal 3: Start Evidence server
npm run dev
```

### CLI Only (Original Interface)
```bash
# Start Evidence dev server
npm run dev

# Run conversation engine (separate terminal)
export ANTHROPIC_API_KEY='your-key'
python -m engine
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API for conversation engine |
| `SECRET_KEY` | Yes | JWT token signing for auth |
| `SMTP_*` | For auth | Email sending for magic links |
| `OPENAI_API_KEY` | Optional | OpenAI provider support |
| `GOOGLE_API_KEY` | Optional | Gemini provider support |

*At least one LLM provider API key required

## Database Schema

```
users
├── id, email, name, preferred_provider
├── created_at

conversation_sessions
├── id, user_id, title, messages (JSON)
├── phase, intent, target_dashboard
├── dashboard_id (FK), created_at, updated_at

dashboards
├── id, user_id, slug, title, file_path
├── original_request, created_at, updated_at

qa_history
├── id, dashboard_id, passed, summary
├── critical_issues (JSON), suggestions (JSON)
├── auto_fix_attempted, auto_fix_succeeded
├── run_type, created_at
```

## Known Issues / Fixes Applied

1. **SQL generation**: LLM uses DuckDB syntax, not Snowflake (enforced via prompts)
2. **Format strings**: Auto-converted from Python-style to Evidence keywords
3. **QA false positives**: Fixed to properly detect broken dashboards
4. **Refinement state**: Session state properly restored from database
5. **Grey boxes**: Normal Evidence behavior, ignored by QA
6. **Gemini models**: Updated to gemini-2.0-flash (old models deprecated)
7. **Gemini API key**: Fixed to prioritize GOOGLE_API_KEY env var
8. **SQL validation**: Fixed trailing semicolon issue in subqueries
9. **Provider race condition**: Fixed ProviderSelect binding issue

## What's Next

- [ ] Scheduled QA monitoring for all dashboards
- [ ] More chart types and layouts
- [ ] Dashboard templates
- [ ] Multi-user permissions
- [ ] Dashboard sharing/embedding
- [ ] Production deployment

## Dependencies

```
# Python (requirements.txt)
anthropic>=0.18.0
openai>=1.0.0
google-generativeai>=0.3.0
fastapi>=0.109.0
sqlalchemy>=2.0.0
pyjwt>=2.8.0
python-multipart>=0.0.6
pyyaml>=6.0
rich>=13.0
snowflake-connector-python
playwright>=1.40.0
duckdb>=0.9.0

# Node (package.json)
evidence + snowflake connector

# Frontend (frontend/package.json)
svelte, sveltekit, marked, monaco-editor
```
