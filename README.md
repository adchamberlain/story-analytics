# Story Analytics

Conversational AI for building data dashboards. Tell Story what you need, and it creates the dashboard for you.

**Website:** [story.bi](https://story.bi)

## What is Story?

Story is an AI-powered dashboard builder that lets you create and edit data visualizations using natural language. Instead of writing SQL and configuring charts manually, you simply describe what you want to see.

Built on [Evidence.dev](https://evidence.dev) for rendering and powered by Claude for understanding your intent.

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY='your-key-here'

# Start the Evidence dev server
npm run dev

# In a separate terminal, run Story
python -m engine
```

## Usage

Once running, simply describe what you want:

- "Create a customer churn dashboard"
- "Show me revenue trends by region"
- "I need a dashboard tracking user signups over time"
- "Edit the sales dashboard to add a monthly breakdown"

Story will gather context, understand your data, and generate the dashboard.

## Commands

| Command | Description |
|---------|-------------|
| `list` | Show existing dashboards |
| `new` | Start a fresh conversation |
| `brand` | Apply brand configuration from `brand_config.yaml` |
| `quit` | Exit the CLI |

## Configuration

| File | Purpose |
|------|---------|
| `engine_config.yaml` | LLM provider and database connection settings |
| `brand_config.yaml` | Customize colors, fonts, and logo |
| `evidence.config.yaml` | Evidence theme and chart colors |

## Requirements

- Node.js 18+
- Python 3.8+
- Anthropic API key
- Data source (Snowflake, DuckDB, PostgreSQL, etc.)

## Learn More

- [Evidence.dev Documentation](https://docs.evidence.dev/)
- [Anthropic API](https://docs.anthropic.com/)
