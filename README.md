# Story Analytics

AI-native analytics. Create dashboards by describing what you need.

**Website:** [storyanalytics.dev](https://storyanalytics.dev)

## What is Story?

Story is an AI-powered dashboard builder. Describe what you want to see, and Story's AI agents write the SQL, design the visualizations, and catch errors automatically.

Built on [Evidence.dev](https://evidence.dev) for rendering. Choose Claude, OpenAI, or Gemini as your AI.

## Features

- **Natural language to dashboard** - Describe what you want, Story builds it
- **Choose your AI** - Claude, OpenAI, or Gemini
- **Automatic SQL generation** - No need to write queries manually
- **QA validation** - Screenshots and validates dashboards automatically
- **Auto-fix** - Detects and fixes broken dashboards
- **Split-pane editor** - Edit markdown with live preview
- **Web app + CLI** - Use via browser or command line

## Quick Start

### Web Application

```bash
# Install dependencies
npm install
pip install -r requirements.txt
playwright install chromium

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

## LLM Providers

Story supports multiple AI providers. Set your preferred provider in Settings:

| Provider | Environment Variable | Models |
|----------|---------------------|--------|
| Claude | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Gemini | `GOOGLE_API_KEY` | gemini-2.0-flash |

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
├── pages/               # Evidence dashboard pages
├── static/              # Static assets (favicon, icons)
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
| `ANTHROPIC_API_KEY` | Yes* | Claude API for conversation engine |
| `SECRET_KEY` | For web app | JWT token signing |
| `OPENAI_API_KEY` | Optional | OpenAI provider support |
| `GOOGLE_API_KEY` | Optional | Gemini provider support |

*At least one LLM provider API key required

## Requirements

- Node.js 18+
- Python 3.10+
- At least one LLM API key (Anthropic, OpenAI, or Google)
- Data source (Snowflake, BigQuery, PostgreSQL, etc.)

## Learn More

- [Evidence.dev Documentation](https://docs.evidence.dev/)
- [Project Status](PROJECT_STATUS.md) - Detailed implementation status
