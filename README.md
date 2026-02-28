# Story Analytics

Publication-ready dashboards from any data source.

**Website:** [storyanalytics.ai](https://storyanalytics.ai)

## What is Story Analytics?

Story Analytics is an open-source dashboarding tool that produces publication-ready charts from any SQL database or CSV file. You build charts with a visual editor and built-in SQL workbench, arrange them on drag-and-drop dashboards, and export to SVG, PNG, PDF, or PowerPoint (PPTX).

An AI assistant (Claude, GPT, or Gemini) is available to help write SQL, add calculated fields, and refine chart styling — but you're always in control.

Ships with **The Perfect Dashboard** — a showcase of all 25 chart types with sample data, ready to explore the moment you start the app.

## Features

### Charts & Visualization
- **25 chart types** — Classic (bar, line, area, scatter, histogram, heatmap, box plot, pie, treemap, data table), Analytical (dot plot, range, bullet bar, small multiples, stacked/grouped column, split bars, arrow plot), Maps (choropleth, symbol, locator, spike), Specialty (big value / KPI, election donut, multiple pies)
- **Geographic maps** — 4 map types with basemap selection, zoom/pan, and label collision avoidance
- **Observable Plot rendering** — Clean SVG output with publication-ready defaults
- **Annotations** — Reference lines, text labels, and highlighted ranges with responsive scaling
- **Custom themes** — 9 built-in themes, custom CSS, 50+ Google Fonts, and logo upload
- **Color palettes** — Curated publication-ready palettes with professionally designed defaults

### Editor & Data
- **Visual chart editor** — Pick chart types, map columns, adjust colors and labels with instant live preview
- **SQL workbench** — Write custom queries, see results in a data table, map columns to chart axes
- **Any data source** — Snowflake, PostgreSQL, BigQuery, Google Sheets, CSV upload, or paste data directly
- **Data transforms** — Transpose, rename, delete, reorder, round, prepend/append, edit cells, cast types
- **Version history** — Auto-save snapshots with one-click restore
- **Templates** — Save chart configurations as reusable templates
- **Folders** — Organize charts and dashboards into folders

### Dashboards & Export
- **Drag-and-drop dashboards** — Responsive grid layout, drag to reposition, resize to adjust
- **Export** — SVG, PNG, PDF, PowerPoint (PPTX), and CSV data download with embedded fonts for standalone rendering
- **Portable HTML export** — Download a self-contained HTML dashboard you can host anywhere — GitHub Pages, Netlify, S3, or your own server

### AI Assistant
- **Multi-provider** — Claude, GPT, or Gemini helps with SQL, derived metrics, and chart refinement
- **Natural language** — Ask the AI to write queries, add calculated fields, or adjust chart styling

### Auth & Collaboration
- **Authentication** — Email-based magic link login with automatic user creation
- **Teams** — Create teams, add members, assign roles (admin/member)
- **Comments** — Threaded comments on charts and dashboards
- **API keys** — Generate scoped API keys for programmatic access

### Deployment
- **Local-first** — Run locally with file-based JSON storage, no cloud account required
- **Cloud-ready** — Deploy to AWS with the included CloudFormation template, Docker images, and S3 storage backend
- **Dark mode** — Full light/dark theme support

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

Open **http://localhost:3001** to start building. The Perfect Dashboard with 25 example charts loads automatically on first run.

## How It Works

1. **Connect your data** — Upload a CSV, paste data, link a Google Sheet, or connect to Snowflake, PostgreSQL, or BigQuery. Data is ingested into a local DuckDB engine for fast queries.

2. **Build your charts** — Use the visual editor to pick a chart type, map columns, and style your output. Switch to SQL mode for custom queries. The AI assistant can help write SQL and refine formatting.

3. **Assemble dashboards** — Drag charts onto a responsive grid, arrange the layout, and save. Export as SVG, PNG, PDF, PowerPoint, or a portable HTML file you can host anywhere.

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

## Deployment

### Local (default)

Run locally with `./dev.sh`. All data stored as JSON files in `data/`.

### Cloud (AWS)

Deploy to AWS using the included infrastructure:

```bash
python3 -m deploy.cli deploy --region us-east-2
```

See **[docs/deploy-aws.md](docs/deploy-aws.md)** for a step-by-step guide covering VPC, RDS PostgreSQL, S3 storage, ECR, and App Runner.

### Docker

```bash
docker build -f Dockerfile.prod -t story-analytics .
docker run -p 8000:8000 story-analytics
```

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
│   ├── routers/            # REST endpoints (charts, data, auth, teams)
│   └── services/           # Storage, DuckDB, connectors
├── engine/                 # LLM integration layer
│   ├── v2/                 # Chart proposer and editor
│   └── prompts/            # YAML prompt templates
├── deploy/                 # AWS CloudFormation + deploy scripts
├── data/                   # Local data storage (gitignored)
│   ├── seed/               # Example dashboard + charts (committed)
│   ├── uploads/            # Uploaded CSV files
│   ├── charts/             # Saved chart configs (JSON)
│   └── dashboards/         # Saved dashboard layouts (JSON)
└── website/                # Marketing site (storyanalytics.ai)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Charting | Observable Plot (D3-based) |
| Frontend | React 18, TypeScript, Tailwind CSS v4, Zustand |
| Backend | FastAPI, Python |
| SQL Engine | DuckDB (in-process) |
| Database | SQLite (local) or PostgreSQL (cloud) |
| Storage | Local filesystem or S3 |
| Dashboards | react-grid-layout v2 |
| Connectors | Snowflake, PostgreSQL, BigQuery, Google Sheets |
| Deploy | Docker, AWS CloudFormation, App Runner |

## Requirements

- Node.js 18+
- Python 3.10+
- At least one LLM API key (Anthropic, OpenAI, or Google)

## License

Built by [Andrew Chamberlain](https://andrewchamberlain.com).
