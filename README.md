# Story Analytics

Conversational AI for building data dashboards. Tell Story what you need, and it creates the dashboard for you.

**Website:** [story.bi](https://story.bi)

## What is Story?

Story is an AI-powered dashboard builder that lets you create and edit data visualizations using natural language. Instead of writing SQL and configuring charts manually, you simply describe what you want to see.

Built on [Evidence.dev](https://evidence.dev) for rendering and powered by Claude for understanding your intent.

## Features

- **Natural language dashboard creation** - Describe what you want, Story builds it
- **Automatic SQL generation** - No need to write queries manually
- **QA validation** - Screenshots and validates dashboards automatically
- **Auto-fix** - Detects and fixes broken dashboards
- **Web app + CLI** - Use via browser or command line

## Quick Start

### Web Application

```bash
# Install dependencies
npm install
pip install -r requirements.txt

# Set environment variables
export ANTHROPIC_API_KEY='your-key-here'
export SECRET_KEY='your-secret-key'

# Terminal 1: Start Evidence server
npm run dev

# Terminal 2: Start FastAPI backend
cd api && uvicorn main:app --reload --port 8000

# Terminal 3: Start SvelteKit frontend
cd frontend && npm run dev
```

Open http://localhost:5173 to access the web interface.

### CLI Only

```bash
# Start Evidence dev server
npm run dev

# In a separate terminal, run Story CLI
python -m engine
```

## Usage

Once running, simply describe what you want:

- "Create a customer churn dashboard"
- "Show me revenue trends by region"
- "I need a dashboard tracking user signups over time"
- "Edit the sales dashboard to add a monthly breakdown"

Story will gather context, understand your data, and generate the dashboard.

## CLI Commands

| Command | Description |
|---------|-------------|
| `list` | Show existing dashboards |
| `new` | Start a fresh conversation |
| `brand` | Apply brand configuration from `brand_config.yaml` |
| `quit` | Exit the CLI |

## Architecture

```
story-analytics/
├── api/                 # FastAPI backend
│   ├── routers/         # API endpoints
│   ├── models/          # SQLAlchemy models
│   └── schemas/         # Pydantic schemas
├── frontend/            # SvelteKit frontend
│   └── src/
│       ├── lib/         # Components and stores
│       └── routes/      # Pages
├── engine/              # LLM conversation engine
│   ├── prompts/         # YAML prompt templates
│   ├── components/      # Evidence component reference
│   ├── qa/              # QA validation rules
│   └── llm/             # LLM provider integrations
└── sources/             # Database connections
```

## Configuration

| File | Purpose |
|------|---------|
| `engine_config.yaml` | LLM provider and database connection settings |
| `brand_config.yaml` | Customize colors, fonts, and logo |
| `evidence.config.yaml` | Evidence theme and chart colors |
| `sources/*/dialect.yaml` | SQL dialect rules per data source |
| `engine/qa/rules.yaml` | QA validation behavior |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API for conversation engine |
| `SECRET_KEY` | For web app | JWT token signing |
| `OPENAI_API_KEY` | Optional | OpenAI provider support |
| `GOOGLE_API_KEY` | Optional | Gemini provider support |

## Requirements

- Node.js 18+
- Python 3.10+
- Anthropic API key
- Data source (Snowflake, DuckDB, PostgreSQL, etc.)

## Learn More

- [Evidence.dev Documentation](https://docs.evidence.dev/)
- [Anthropic API](https://docs.anthropic.com/)
- [Project Status](PROJECT_STATUS.md) - Detailed implementation status
