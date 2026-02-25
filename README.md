# Story Analytics

Publication-ready dashboards from any data source.

**Website:** [storyanalytics.ai](https://storyanalytics.ai)

## What is Story Analytics?

Story Analytics is an open-source dashboarding tool that produces publication-ready charts from any SQL database or CSV file. You build charts with a visual editor and built-in SQL workbench, arrange them on drag-and-drop dashboards, and export to SVG, PNG, PDF, or PowerPoint (PPTX).

An AI assistant (Claude, GPT, or Gemini) is available to help write SQL, add calculated fields, and refine chart styling — but you're always in control.

## Features

- **25 chart types** — Classic (bar, line, area, scatter, histogram, heatmap, box plot, pie, treemap, data table), Analytical (dot plot, range, bullet bar, small multiples, stacked/grouped column, split bars, arrow plot), Maps (choropleth, symbol, locator, spike), Specialty (KPI cards, election donut, multiple pies)
- **Geographic maps** — 4 map types with basemap selection, zoom/pan, and label collision avoidance
- **Observable Plot rendering** — Clean SVG output with publication-ready defaults
- **Visual chart editor** — Pick chart types, map columns, adjust colors and labels with instant live preview
- **SQL workbench** — Write custom queries, see results in a data table, map columns to chart axes
- **Drag-and-drop dashboards** — Responsive grid layout, drag to reposition, resize to adjust
- **Any data source** — Snowflake, PostgreSQL, BigQuery, Google Sheets, or CSV upload
- **AI assistant** — Claude, GPT, or Gemini helps with SQL, derived metrics, and chart refinement
- **Export** — SVG, PNG, PDF, PowerPoint (PPTX), and CSV data download
- **Data transforms** — Transpose, rename, delete, reorder, round, prepend/append, edit cells, cast types
- **Version history** — Auto-save snapshots with one-click restore
- **Annotations** — Reference lines, text labels, and highlighted ranges with responsive scaling
- **API** — RESTful endpoints with key-based authentication
- **Custom themes** — 9 built-in themes, custom CSS, 50+ Google Fonts, and logo upload
- **KPI cards** — Single-number displays with comparison values, trend indicators, and color-coded deltas
- **Color palettes** — Curated publication-ready palettes with professionally designed defaults
- **Dark mode** — Full light/dark theme support
- **Local-first** — All data stays on your machine, stored as JSON files

## Quick Start

```bash
# Clone the repo
git clone https://github.com/adchamberlain/story-analytics.git
cd story-analytics

# Install dependencies
pip install -r requirements.txt
cd app && npm install && cd ..

# Configure your AI provider (at least one key required)
cp .env.example .env
# Edit .env and add your API key

# Start dev server (API on :8000 + React on :3001)
./dev.sh
```

Open **http://localhost:3001** to start building.

## How It Works

1. **Connect your data** — Upload a CSV or connect to Snowflake, PostgreSQL, or BigQuery. Data is ingested into a local DuckDB engine for fast queries.

2. **Build your charts** — Use the visual editor to pick a chart type, map columns, and style your output. Switch to SQL mode for custom queries. The AI assistant can help write SQL and refine formatting.

3. **Assemble dashboards** — Drag charts onto a responsive grid, arrange the layout, and save. Share via link or export as SVG, PNG, PDF, or PowerPoint.

## AI Providers

Story Analytics supports multiple LLM providers. Configure your preferred provider in **Settings** or via environment variables:

| Provider | Environment Variable | Example Models |
|----------|---------------------|----------------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet, Claude Opus |
| OpenAI | `OPENAI_API_KEY` | GPT-4o |
| Google | `GOOGLE_API_KEY` | Gemini 2.0 Flash |

The AI assistant helps with:
- Writing SQL queries and window functions
- Adding calculated fields and derived metrics
- Adjusting chart configuration (axis labels, colors, formatting)
- Suggesting chart improvements

## Architecture

```
story-analytics/
├── app/                    # React + TypeScript frontend
│   └── src/
│       ├── components/     # Charts, editor, dashboard, data
│       ├── pages/          # All app pages
│       ├── stores/         # Zustand state management
│       └── types/          # TypeScript interfaces
├── api/                    # FastAPI backend
│   ├── routers/            # REST endpoints
│   └── services/           # Storage, DuckDB, connectors
├── engine/                 # LLM integration layer
│   ├── v2/                 # Chart proposer and editor
│   └── prompts/            # YAML prompt templates
├── data/                   # Local data storage (gitignored)
│   ├── uploads/            # Uploaded CSV files
│   ├── charts/             # Saved chart configs (JSON)
│   ├── dashboards/         # Saved dashboard layouts (JSON)
│   └── settings.json       # App settings (API keys, provider)
└── website/                # Marketing site (storyanalytics.ai)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Charting | Observable Plot (D3-based) |
| Frontend | React 18, TypeScript, Tailwind CSS v4, Zustand |
| Backend | FastAPI, Python |
| SQL Engine | DuckDB (in-process) |
| Dashboards | react-grid-layout v2 |
| Connectors | Snowflake, PostgreSQL, BigQuery |

## Requirements

- Node.js 18+
- Python 3.10+
- At least one LLM API key (Anthropic, OpenAI, or Google)

## License

Built by [Andrew Chamberlain](https://andrewchamberlain.com).
