# Story Analytics

AI-native analytics. Create dashboards by describing what you need.

**Website:** [storyanalytics.dev](https://storyanalytics.dev)

## What is Story?

Story is an AI-powered dashboard builder. Describe what you want to see, and Story's AI agents write the SQL, design the visualizations, and catch errors automatically.

Built with React + Plotly.js for professional chart rendering. Choose Claude, OpenAI, or Gemini as your AI.

## Features

- **Natural language to dashboard** - Describe what you want, Story builds it
- **Button-driven workflow** - Explicit actions (Generate, Modify, Done) instead of magic words
- **Choose your AI** - Claude, OpenAI, or Gemini
- **Automatic SQL generation** - No need to write queries manually
- **QA validation** - Screenshots and validates dashboards automatically
- **Auto-fix** - Detects and fixes broken dashboards
- **Professional charts** - React + Plotly.js with Tableau-quality visuals

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt
cd app && npm install && cd ..

# Set environment variables
export ANTHROPIC_API_KEY='your-key-here'
export SECRET_KEY='your-secret-key'

# Start dev server (API + React)
./dev.sh
```

Open http://localhost:3001 to access the web interface.

## Usage

1. Click **Create New Chart** or start a chat
2. Describe what you want to see
3. Click **Generate** when ready, or **Modify Plan** to refine
4. After generation, click **Done** or **Modify** to iterate

Example prompts:
- "Show me MRR trends and churn rates"
- "Monthly revenue by customer segment"
- "Top 10 customers by revenue"

Story will understand your data and generate the chart.

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
├── app/                 # React frontend
│   └── src/
│       ├── components/  # Chart and UI components
│       ├── pages/       # Page components
│       └── stores/      # Zustand state management
├── engine/              # LLM conversation engine
│   ├── prompts/         # YAML prompt templates
│   ├── qa/              # QA validation rules
│   └── llm/             # LLM provider integrations
├── data/                # Parquet data files
└── sources/             # Database connections
```

## Configuration

| File | Purpose |
|------|---------|
| `engine_config.yaml` | LLM provider and database connection settings |
| `brand_config.yaml` | Customize colors, fonts, and logo |
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
