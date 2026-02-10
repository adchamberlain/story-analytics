# Strategic Plan: Story Analytics — The Looker Replacement

## North Star

Build a complete, AI-native dashboarding platform that replaces Looker. Use LookML as the **migration wedge** — parse a company's existing LookML repo to extract their entire data context (years of institutional knowledge encoded in views, explores, measures, joins), then build our own dashboarding suite on top of that extracted foundation.

LookML is the **input**, not the output. The product is the replacement.

```
Existing Looker instance
  (years of institutional knowledge in LookML)
      ↓
  EXTRACT: Parse LookML → our data context
      ↓
  Our data context (AI-native, richer, portable)
      ↓
  Our dashboard suite
    - Metric catalog (browse, search, understand)
    - Conversational analytics (ask questions, get answers)
    - Visual dashboards (React + Plotly, professional quality)
    - AI-powered: LLM selects from known metrics, never hallucinates SQL
```

**Target user:** Data analyst or data scientist on an analytics team currently using Looker. They understand the data, they know what metrics they need, but Looker is slow, rigid, and expensive.

**Day-one scenario:** Walk into a company with an existing Looker implementation. Parse their LookML repo. In hours, have a working data context with every metric, dimension, and join they've built over years — now portable and powering our platform.

---

## Why This Approach Wins

### 1. The LookML Migration Wedge

Every Looker customer has invested months or years encoding business logic into LookML. That investment is trapped — it only works inside Looker. By parsing LookML into a portable data context, we:

- **Capture institutional knowledge** without rebuilding it from scratch
- **Reduce migration risk** — the data context is proven (it's what they're already using)
- **Create immediate value** — day one, every metric they had in Looker is available in our platform
- **Lower switching costs** — the hardest part of leaving Looker (recreating the data model) is automated

### 2. AI-Native Architecture

Looker was built for point-and-click exploration. Our platform is built for conversation. The data context makes this work:

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
- Metric compiler (data context YAML → SQL)
- Visual QA validation (Playwright + vision API)
- SQL validation against DuckDB
- 97% chart generation pass rate on standard tests

What's missing is the **data context extraction from LookML** and the **structured metric catalog UI**. The rendering and conversation infrastructure exists.

---

## Architecture

### Our Data Context Format

The core of the system. Everything — LookML extraction, metric catalog, conversation engine, SQL generation — connects through this. Full spec in `DATA_CONTEXT_SPEC.md`.

```yaml
# What we extract from LookML and enrich with AI
data_context:
  source: "extracted from company-lookml-repo, 2026-02-15"

  tables:
    - name: order_items
      table: analytics.fct_order_items
      description: "Revenue fact table at the line-item level"
      grain: order_item_id

      dimensions:
        - name: product_category
          type: categorical
          description: "Product category (English names)"
          tags: [product, categorical]

        - name: order_date
          type: time
          granularities: [day, week, month, quarter, year]

      measures:
        - name: gmv
          agg: sum
          expr: price
          label: "Gross Merchandise Value"
          description: "Total revenue before freight. Primary revenue metric."
          format: currency

        - name: order_count
          agg: count_distinct
          expr: order_id

  metrics:
    - name: average_order_value
      type: derived
      expression: "gmv / order_count"
      description: "Revenue per order. Key efficiency metric."

  joins:
    - name: order_analysis
      base_table: order_items
      joins:
        - table: customers
          relationship: many_to_one
          on: "${order_items.customer_id} = ${customers.customer_id}"
      description: "Primary join graph for revenue and order analysis"
```

This format is:
- **Portable** — not locked to any BI tool
- **LLM-readable** — structured enough for the LLM to reason over
- **Compilable** — the metric compiler can generate correct SQL from it
- **Richer than LookML** — includes knowledge base, validated examples, data quirks

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
│  │              Our Data Context                             │  │
│  │  (tables, metrics, joins, knowledge, validated examples) │  │
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

### Phase 1: Data Context Creation Engine

**Goal:** Build the end-to-end workflow for creating a data context. Two entry points: (1) LookML migration (richest path), (2) starting from scratch with just a database. Both follow the same five-step creation workflow defined in `DATA_CONTEXT_SPEC.md`.

**Design principle: AI generates, humans review.** No one writes YAML. No one stares at schema dumps. The system does the research and drafts the document; domain experts review it like they'd review a memo from an employee.

**What to build:**

#### 1a. Connect & Discover (Step 1)
- Database connection setup (Snowflake, BigQuery, Postgres, DuckDB)
- Schema crawler: enumerate tables, columns, types
- Data profiler: row counts, cardinality, null rates, sample values, date ranges, distribution analysis
- Foreign key detector: column name matching + value overlap analysis
- Output: raw profile data that feeds into the generation step

#### 1b. Context Gathering (Step 2)

The minimum path is just the database connection — everything else is additive. No step here should require the user to leave the flow and manually collect files from colleagues.

**Automatic (from the database connection itself):**
- **Query history extractor** — Pull recent SQL directly from the warehouse:
  - Snowflake: `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY`
  - BigQuery: `INFORMATION_SCHEMA.JOBS`
  - Redshift: `STL_QUERYTEXT` / `SVL_STATEMENTTEXT`
  - Postgres: `pg_stat_statements`
  - Extract the last 90 days, deduplicate, identify commonly-used metrics, joins, and filter patterns
  - This replaces the "ask your colleagues for SQL" step entirely

**One-click (if available):**
- **GitHub org scan** — User connects their GitHub org (OAuth). System scans for:
  - `.lkml` files → LookML parser (`lkml` package, MIT license). Handle views, explores, models, derived tables, refinements, extends. Map `view` → `table`, `explore` → `join`, `dimension_group` → `time dimension`.
  - `dbt_project.yml` → dbt ingester. Parse `schema.yml`, `metrics.yml`, model SQL files.
  - Present a list: "We found these repos. Which ones are relevant?" One click to select.

**Optional (user provides if they have it):**
- Business documentation, data dictionaries, wiki pages, onboarding docs
- Plain-text business description
- Additional SQL files beyond what query history captured

Each input gets compressed into structured context for the LLM. More inputs → better output, but the minimum viable path (profiling + query history) requires nothing beyond the database connection.

#### 1c. Draft Generation (Step 3)
- LLM synthesizes all inputs (profile + ingested context) into a complete data context
- Generates: tables, dimensions, measures, metrics, joins, knowledge base (business rules, data quirks, glossary)
- Output stored as YAML internally — **users never see YAML**
- Leverages Tier 3 patterns from PoC (73% metric name accuracy with business docs)

#### 1d. Review Memo Generator (Step 4)
- Converts YAML data context into a **plain-language review document**
- Organized by business domain (Revenue, Customers, Product, etc.)
- Each section is a bullet-point memo: metric name, plain-English definition, how it's calculated
- Includes "How Tables Connect" section (joins in plain English) and "Things to Watch Out For" (data quirks)
- **Review process modeled on PR/doc review:**
  - Different domain experts review different sections (revenue team reviews revenue metrics, etc.)
  - Reviewers make corrections in plain language ("We call this Net Revenue, not Realized GMV")
  - AI takes corrections and updates the data context. Reviewers never touch YAML.
  - Multiple rounds are fine — each produces a cleaner memo

#### 1e. Automated Validation (Step 5)
- **Automated checks (no human needed):**
  - SQL compilation: every metric definition produces valid, executable SQL
  - Row count consistency across joined tables
  - Foreign key integrity (do join keys actually match?)
  - Sanity checks: no negative revenue, no future dates, no NULL primary keys
  - Internal consistency: metrics that should be related actually add up (GMV = Realized GMV + Canceled GMV)
- **Cross-reference checks (minimal human input):**
  - Compare key numbers against existing trusted sources (Looker dashboards, board decks, spreadsheets)
  - Present as: "Your Looker dashboard shows Q1 GMV was $4.2M. Our calculation gives $4.18M — within 0.5%."
  - Humans confirm order of magnitude only — not exact values
- **Output:** `validated_examples` with machine-generated benchmarks and tolerance ranges

#### 1f. Incremental Updates
- Detect schema changes (new tables, new columns, dropped columns)
- Generate diff-style review memo: "3 new columns added to order_items. Recommended: add shipping_method as a categorical dimension."
- Same review process — domain expert approves or corrects the diff

**Key decision:** Use `lkml` for LookML parsing, don't build our own. Focus on the creation workflow and review experience.

**Existing code to reuse:**
- `engine/semantic.py` — Data context models (extend for richer concepts)
- `engine/metric_compiler.py` — Validation that extracted metrics compile to valid SQL
- `engine/semantic_generator.py` — AI enrichment patterns from Tier 3
- `tools/build_semantic_layer.py` — PoC profiling and generation pipeline

**Deliverable:** `story create` → connect, ingest, generate, review memo, validate → working data context.

**Success criteria:**
- LookML path: Parse a real-world repo (50+ views) and produce a reviewable memo in under 5 minutes
- From-scratch path: Profile a database and produce a reviewable memo in under 10 minutes
- Extract 95%+ of dimensions and measures correctly from LookML
- Generated SQL for every metric executes successfully against the database
- Review memo is clear enough that a product manager can read and correct it

---

### Phase 2: Metric Catalog & Structured Queries

**Goal:** A browsable, searchable metric catalog that analysts use instead of Looker's Explore interface. Every query is structured against the data context — no SQL hallucination.

**What to build:**

1. **Metric Catalog UI** (React)
   - Browse metrics by domain (revenue, growth, customers, etc.)
   - Search by name, description, or SQL fragment
   - View metric details: definition, SQL, which join graph it uses, related metrics
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
- Every query in the catalog returns correct results (compiled from data context, never hallucinated)
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
   - Select from the data context (not freeform SQL)
   - Choose visualization type (with smart defaults)
   - Configure: colors, labels, formatting, axis scales
   - AI-assisted: "make this a stacked bar chart with the top 5 categories"

3. **Dashboard Templates**
   - Auto-generate dashboard suggestions based on the data context
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
- Git integration for data context changes
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
- **Data context evolution:** AI suggests new metrics based on query patterns

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
- `engine/semantic.py` — Data context models (**Phase 1, extend**)
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
- **Phase 1:** Data context creation engine (connect, ingest, generate, review, validate)
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
| Data context | LookML (manual, tedious) | Extracted from LookML + AI-enriched |
| Query interface | Point-and-click explores | Conversational + visual catalog |
| Dashboard creation | Drag-and-drop, manual | AI-assisted with smart defaults |
| New metric creation | Write LookML, PR, deploy | Describe in English, validate, deploy |
| Cost | $50K-500K/year | Internal tool (free), then ??? |
| Migration | Locked in | Designed for migration FROM Looker |

### vs. Other BI tools (Tableau, Mode, Metabase)
- They don't have data context layers (or weak ones)
- We start with a proven data context extracted from LookML
- AI-native from the ground up, not bolted on

### vs. AI BI tools (ThoughtSpot, etc.)
- They generate SQL from schema → hallucination risk
- We compile SQL from metric definitions → guaranteed accuracy
- Our data context has richer context (extracted from LookML + AI-enriched)

---

## Open Questions

1. **What database(s) does the target company use?** Snowflake, BigQuery, Redshift? This determines which SQL dialect we prioritize. Our `dialect.yaml` system handles this, but we need to know the primary target.

2. **LookML complexity.** How heavily do they use advanced LookML features — refinements, extends, liquid templating, access grants, PDTs? This determines how robust Phase 1 parsing needs to be.

3. **Migration scope.** Do we need to migrate existing Looker dashboards (import the dashboard definitions, not just the LookML model)? Or is it OK to rebuild dashboards fresh on the new platform?

4. **Coexistence period.** Will Looker and Story Analytics run in parallel during migration? If so, we might need to support syncing data context changes bidirectionally.

5. **Team adoption sequence.** Start with power users (data team) and expand, or launch for the whole org at once? This affects Phase 4 scope.

---

*Document updated: 2026-02-09*
*Vision: Extract data context from LookML → build AI-native Looker replacement*
*Previous versions archived in git history*
