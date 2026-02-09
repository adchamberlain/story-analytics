# Strategic Plan: Story Analytics — The Looker Replacement

## North Star

Build a complete, AI-native dashboarding platform that replaces Looker. Use LookML as the **migration wedge** — parse a company's existing LookML repo to extract their entire semantic layer (years of institutional knowledge encoded in views, explores, measures, joins), then build our own dashboarding suite on top of that extracted foundation.

LookML is the **input**, not the output. The product is the replacement.

```
Existing Looker instance
  (years of institutional knowledge in LookML)
      ↓
  EXTRACT: Parse LookML → our semantic layer
      ↓
  Our semantic layer (AI-native, richer, portable)
      ↓
  Our dashboard suite
    - Metric catalog (browse, search, understand)
    - Conversational analytics (ask questions, get answers)
    - Visual dashboards (React + Plotly, professional quality)
    - AI-powered: LLM selects from known metrics, never hallucinates SQL
```

**Target user:** Data analyst or data scientist on an analytics team currently using Looker. They understand the data, they know what metrics they need, but Looker is slow, rigid, and expensive.

**Day-one scenario:** Walk into a company with an existing Looker implementation. Parse their LookML repo. In hours, have a working semantic layer with every metric, dimension, and explore they've built over years — now portable and powering our platform.

---

## Why This Approach Wins

### 1. The LookML Migration Wedge

Every Looker customer has invested months or years encoding business logic into LookML. That investment is trapped — it only works inside Looker. By parsing LookML into a portable semantic layer, we:

- **Capture institutional knowledge** without rebuilding it from scratch
- **Reduce migration risk** — the semantic layer is proven (it's what they're already using)
- **Create immediate value** — day one, every metric they had in Looker is available in our platform
- **Lower switching costs** — the hardest part of leaving Looker (recreating the data model) is automated

### 2. AI-Native Architecture

Looker was built for point-and-click exploration. Our platform is built for conversation. The semantic layer makes this work:

- **Structured conversations:** The LLM selects from known metrics and dimensions, not hallucinating SQL
- **Guaranteed accuracy:** SQL is compiled from metric definitions, not generated from vague schema descriptions
- **Rich context:** Every metric has a definition, description, and lineage the LLM can reference
- **Our Tier 3 proof of concept:** 73% exact metric name match (92% with near-misses) shows this approach works

### 3. The Existing Codebase is 60% There

We've already built:
- Multi-LLM conversation engine (Claude, OpenAI, Gemini)
- React + Plotly.js frontend with professional chart components
- FastAPI backend with auth, persistence, and API routes
- 3-stage pipeline (Requirements → SQL → Layout)
- Metric compiler (semantic layer YAML → SQL)
- Visual QA validation (Playwright + vision API)
- SQL validation against DuckDB
- 97% chart generation pass rate on standard tests

What's missing is the **semantic layer extraction from LookML** and the **structured metric catalog UI**. The rendering and conversation infrastructure exists.

---

## Architecture

### Our Semantic Layer Format

The core of the system. Everything — LookML extraction, metric catalog, conversation engine, SQL generation — connects through this.

```yaml
# What we extract from LookML and enrich with AI
semantic_layer:
  source: "extracted from company-lookml-repo, 2026-02-15"

  models:
    - name: order_items
      table: analytics.fct_order_items
      description: "Revenue fact table at the line-item level"
      primary_key: order_item_id

      dimensions:
        - name: product_category
          type: string
          sql: "${TABLE}.product_category"
          description: "Product category (English names)"
          tags: [product, categorical]

        - name: order_date
          type: time
          timeframes: [date, week, month, quarter, year]
          sql: "${TABLE}.order_date"

      measures:
        - name: gmv
          type: sum
          sql: "${TABLE}.price"
          label: "Gross Merchandise Value"
          description: "Total revenue before freight. Primary revenue metric."
          format: currency

        - name: order_count
          type: count_distinct
          sql: "${TABLE}.order_id"

  metrics:
    - name: average_order_value
      type: derived
      expression: "gmv / order_count"
      description: "Revenue per order. Key efficiency metric."

  explores:
    - name: order_analysis
      base_model: order_items
      joins:
        - model: customers
          relationship: many_to_one
          on: "${order_items.customer_id} = ${customers.customer_id}"
      description: "Primary explore for revenue and order analysis"
```

This format is:
- **Portable** — not locked to any BI tool
- **LLM-readable** — structured enough for the LLM to reason over
- **Compilable** — the metric compiler can generate correct SQL from it
- **Richer than LookML** — we can add AI-generated descriptions, usage stats, lineage

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Story Analytics Platform                     │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │   Extract    │  │   Catalog   │  │   Dashboard Suite      │  │
│  │   (Phase 1)  │  │   (Phase 2) │  │   (Phase 3-4)          │  │
│  │             │  │             │  │                        │  │
│  │ LookML repo │  │ Browse      │  │ Conversational charts  │  │
│  │ → parse     │  │ Search      │  │ Visual dashboards      │  │
│  │ → extract   │  │ Understand  │  │ Auto-insights          │  │
│  │ → enrich    │  │ Recommend   │  │ Collaboration          │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬────────────┘  │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Our Semantic Layer                           │  │
│  │  (metrics, dimensions, explores, joins, descriptions)    │  │
│  │  Extracted from LookML + enriched by AI                  │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐              │
│         ▼                   ▼                   ▼              │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │  Metric   │    │     LLM      │    │   Database    │        │
│  │  Compiler │    │   Pipeline   │    │   Connector   │        │
│  │ YAML→SQL  │    │  Claude/etc  │    │  Snowflake/BQ │        │
│  └───────────┘    └──────────────┘    └──────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: LookML Extraction Engine

**Goal:** Parse any LookML repo and produce our semantic layer format. This is the migration wedge.

**What to build:**

1. **LookML Parser Integration**
   - Use the `lkml` Python package (MIT license) to parse `.lkml` files → Python dicts
   - Handle all LookML constructs: views, explores, models, derived tables, refinements, extends
   - Resolve `${TABLE}`, `${view_name.field_name}` references
   - Handle `include:` directives and file organization

2. **Semantic Layer Extractor**
   - Transform parsed LookML into our semantic layer format
   - Map LookML concepts → our concepts:
     - `view` → `model` (with table reference, dimensions, measures)
     - `dimension` / `dimension_group` → `dimension` (with type, timeframes)
     - `measure` → `measure` (with aggregation type, SQL expression)
     - `explore` + `join` → `explore` (with join graph)
     - `derived_table` → `model` with embedded SQL or subquery
   - Preserve labels, descriptions, group_labels, tags
   - Detect naming conventions from the existing LookML

3. **AI Enrichment**
   - For measures/dimensions with no description, use LLM to generate one from the SQL and context
   - Classify metrics by domain (revenue, growth, engagement, etc.)
   - Identify relationships between metrics (AOV = GMV / orders)
   - Generate a "data dictionary" summary for the whole semantic layer

4. **Validation**
   - Round-trip test: parse LookML → our format → generate SQL → validate against DB
   - Count/compare: same number of dimensions, measures, explores as the original
   - Naming preservation: metric names match original LookML field names

**Key decision:** Use `lkml` for parsing, don't build our own. Focus on the extraction and enrichment logic.

**Existing code to reuse:**
- `engine/semantic.py` — SemanticLayer model (extend for richer concepts)
- `engine/metric_compiler.py` — Validation that extracted metrics compile to valid SQL
- `engine/semantic_generator.py` — AI enrichment patterns from Tier 3

**Deliverable:** `story extract /path/to/lookml-repo` → complete semantic layer YAML + summary report.

**Success criteria:**
- Parse a real-world LookML repo (50+ views) in under 30 seconds
- Extract 95%+ of dimensions and measures correctly
- Generated SQL for extracted measures executes successfully against the database

---

### Phase 2: Metric Catalog & Structured Queries

**Goal:** A browsable, searchable metric catalog that analysts use instead of Looker's Explore interface. Every query is structured against the semantic layer — no SQL hallucination.

**What to build:**

1. **Metric Catalog UI** (React)
   - Browse metrics by domain (revenue, growth, customers, etc.)
   - Search by name, description, or SQL fragment
   - View metric details: definition, SQL, which explore it lives in, related metrics
   - Dimension browser: what can you slice each metric by?
   - "Metric lineage" — which measures compose a derived metric

2. **Structured Query Builder**
   - Users select: metric(s) + dimension(s) + filters + time range
   - The metric compiler generates guaranteed-correct SQL
   - No LLM in the query path — pure compilation, instant and deterministic
   - Preview results in a data table before charting

3. **Conversational Query Layer**
   - "Show me revenue by product category for Q4" → LLM maps to:
     `metric: gmv, dimension: product_category, filter: order_date in Q4 2025`
   - The LLM's job is only **selection** (which metrics/dimensions), not **generation** (no SQL)
   - The metric compiler handles SQL
   - This is where 97%+ accuracy becomes achievable — the LLM can't generate bad SQL because it never generates SQL

4. **Saved Queries & Sharing**
   - Save metric + dimension + filter combos as named queries
   - Share with team members
   - Schedule for refresh

**Existing code to reuse:**
- `engine/metric_compiler.py` — Core of the query engine
- `engine/conversation.py` — Conversation state machine
- `engine/llm/` — LLM providers for the conversational layer
- `engine/pipeline/requirements_agent.py` — Requirements extraction (adapt for metric selection)
- `app/src/components/charts/` — All Plotly chart components
- `app/src/stores/` — Zustand state management
- `api/` — FastAPI backend (extend with catalog endpoints)

**Deliverable:** Web UI where analysts browse metrics, build queries visually or conversationally, and see results.

**Success criteria:**
- Every query in the catalog returns correct results (compiled from semantic layer, never hallucinated)
- Conversational queries resolve to the correct metrics 90%+ of the time
- Analysts can find "does this metric exist?" in under 10 seconds

---

### Phase 3: Dashboard Builder

**Goal:** Create, save, and share multi-chart dashboards. This replaces Looker's dashboard functionality.

**What to build:**

1. **Dashboard Canvas**
   - Grid-based layout (drag and drop)
   - Multiple chart types: line, bar, area, scatter, KPI cards, tables
   - Cross-filtering between charts
   - Responsive layout for different screen sizes

2. **Chart Creation Flow**
   - Select from the metric catalog (not freeform SQL)
   - Choose visualization type (with smart defaults)
   - Configure: colors, labels, formatting, axis scales
   - AI-assisted: "make this a stacked bar chart with the top 5 categories"

3. **Dashboard Templates**
   - Auto-generate dashboard suggestions based on the semantic layer
   - "Executive Overview" template that picks key metrics automatically
   - Domain-specific templates (sales, marketing, product, etc.)

4. **Filters & Interactivity**
   - Global dashboard filters (date range, segment, etc.)
   - Drill-down from summary to detail
   - Click-through from KPI to underlying data

**Existing code to reuse:**
- `app/src/components/charts/` — Full Plotly chart component library (Line, Bar, Area, Scatter, BigValue, DataTable, Histogram, Heatmap, Funnel, Sankey, Bubble, DualTrend)
- `app/src/components/layout/DashboardGrid.tsx` — Grid layout
- `app/src/components/layout/ChartCard.tsx` — Chart card container
- `app/src/components/filters/` — DateRange, Dropdown filter components
- `app/src/components/editors/` — Chart config editor with AI assistant
- `app/src/components/chat/` — Chat interface components
- `engine/pipeline/` — Multi-agent pipeline for chart creation
- `engine/qa.py` — Visual QA validation

**Deliverable:** Full dashboard builder that replaces Looker dashboards.

---

### Phase 4: Production & Team Features

**Goal:** Production-grade deployment for a team of 20+ analysts.

**What to build:**
- User management & permissions (viewer, analyst, admin)
- Row-level security (filtered data based on user role)
- Scheduled dashboard refresh & email delivery
- Alerting (notify when a metric crosses a threshold)
- Git integration for semantic layer changes
- Audit log (who queried what, when)
- Performance optimization (query caching, materialized views)
- Looker API integration for migration tooling (import existing dashboards, not just LookML)

**Existing code to reuse:**
- `api/models/` — User, session, dashboard models
- `api/security.py` — JWT auth
- `api/database.py` — SQLAlchemy setup

---

### Phase 5: AI-Native Analytics

**Goal:** Go beyond what Looker can do. This is where AI-native becomes a competitive advantage.

- **Auto-insights:** System proactively identifies anomalies, trends, and interesting patterns
- **Investigation agent:** "Why did revenue drop?" → multi-step analysis with narrative
- **Natural language definitions:** Define new metrics in English, system writes the SQL
- **Predictive analytics:** Forecasting, what-if scenarios
- **Data storytelling:** Auto-generated narrative reports with embedded charts
- **Semantic layer evolution:** AI suggests new metrics based on query patterns

---

## What We Keep vs. Build vs. Discard

### Keep & Use Directly
- `engine/llm/` — Multi-LLM provider support (**all phases**)
- `engine/metric_compiler.py` — Core query engine (**Phase 2+**)
- `engine/conversation.py` — Conversation patterns (**Phase 2+**)
- `engine/pipeline/` — Multi-agent pipeline (**Phase 2+**)
- `engine/prompts/` — YAML prompt architecture (**all phases**)
- `engine/config_loader.py` — Configuration loading (**all phases**)
- `engine/sql_validator.py` — SQL validation (**Phase 1+**)
- `engine/semantic.py` — Semantic layer models (**Phase 1, extend**)
- `engine/semantic_generator.py` — AI enrichment (**Phase 1**)
- `app/src/components/charts/` — All Plotly chart components (**Phase 3**)
- `app/src/components/layout/` — Dashboard grid, sidebar (**Phase 3**)
- `app/src/components/filters/` — Filter components (**Phase 3**)
- `app/src/components/editors/` — Chart config editors (**Phase 3**)
- `app/src/components/chat/` — Chat interface (**Phase 2+**)
- `app/src/stores/` — Zustand state management (**Phase 2+**)
- `api/` — FastAPI backend (**Phase 2+**)
- `engine/qa.py` — Visual QA (**Phase 3+**)
- `sources/*/dialect.yaml` — SQL dialect knowledge (**all phases**)

### Build New
- **Phase 1:** LookML parser integration, semantic layer extractor, AI enrichment pipeline
- **Phase 2:** Metric catalog UI, structured query builder, conversational query layer
- **Phase 3:** Dashboard canvas, chart creation flow, cross-filtering
- **Phase 4:** Permissions, scheduling, alerting, caching
- **Phase 5:** Auto-insights, investigation agent, predictive analytics

### Discard (replaced by better versions)
- `engine/chart_pipeline.py` — Replaced by structured metric queries (Phase 2)
- `engine/chart_conversation.py` — Replaced by catalog-aware conversation (Phase 2)
- `engine/models/chart.py` — Replaced by metric-catalog-based chart models
- `engine/dashboard_composer.py` — Replaced by dashboard canvas (Phase 3)
- `engine/brand.py` — Replaced by proper theming system
- `engine/templates/` — Replaced by catalog-driven suggestions

---

## Competitive Positioning

### vs. Looker (Google)
| Dimension | Looker | Story Analytics |
|---|---|---|
| Semantic layer | LookML (manual, tedious) | Extracted from LookML + AI-enriched |
| Query interface | Point-and-click explores | Conversational + visual catalog |
| Dashboard creation | Drag-and-drop, manual | AI-assisted with smart defaults |
| New metric creation | Write LookML, PR, deploy | Describe in English, validate, deploy |
| Cost | $50K-500K/year | Internal tool (free), then ??? |
| Migration | Locked in | Designed for migration FROM Looker |

### vs. Other BI tools (Tableau, Mode, Metabase)
- They don't have semantic layers (or weak ones)
- We start with a proven semantic layer extracted from LookML
- AI-native from the ground up, not bolted on

### vs. AI BI tools (ThoughtSpot, etc.)
- They generate SQL from schema → hallucination risk
- We compile SQL from metric definitions → guaranteed accuracy
- Our semantic layer has richer context (extracted from LookML + AI-enriched)

---

## Open Questions

1. **What database(s) does the target company use?** Snowflake, BigQuery, Redshift? This determines which SQL dialect we prioritize. Our `dialect.yaml` system handles this, but we need to know the primary target.

2. **LookML complexity.** How heavily do they use advanced LookML features — refinements, extends, liquid templating, access grants, PDTs? This determines how robust Phase 1 parsing needs to be.

3. **Migration scope.** Do we need to migrate existing Looker dashboards (import the dashboard definitions, not just the LookML model)? Or is it OK to rebuild dashboards fresh on the new platform?

4. **Coexistence period.** Will Looker and Story Analytics run in parallel during migration? If so, we might need to support syncing semantic layer changes bidirectionally.

5. **Team adoption sequence.** Start with power users (data team) and expand, or launch for the whole org at once? This affects Phase 4 scope.

---

*Document updated: 2026-02-09*
*Vision: Extract semantic layer from LookML → build AI-native Looker replacement*
*Previous versions archived in git history*
