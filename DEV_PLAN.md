# Strategic Plan: LookML Workbench

## Vision

An LLM-powered LookML workbench that lets analytics teams move fast from stakeholder request to Looker dashboard. The tool handles the LookML plumbing — parsing existing models, generating new views and explores, recommending existing measures — so analysts can focus on analysis, not YAML syntax.

**Target user:** Data analyst or data scientist on an analytics team that uses Looker. They understand the data but don't want to spend hours writing LookML for every new request.

**Day-one scenario:** Walk into a company with an existing Looker implementation. Ingest the LookML repo, build a searchable catalog, and immediately start helping analysts find existing measures or generate new LookML for stakeholder requests.

---

## Why LookML

1. **Concrete pain point.** Writing and maintaining LookML is tedious, specialized work. Most teams have 1-2 LookML experts. When they leave, knowledge leaves.
2. **Large addressable market.** Looker has 10K+ enterprise customers, all with this problem.
3. **Verifiable output.** Generated LookML either works in Looker or it doesn't. Unlike "AI dashboards," quality is measurable.
4. **Foundation for more.** A working semantic layer (which LookML is) unlocks structured AI analytics later — the LLM selects from known metrics instead of hallucinating SQL.
5. **Existing proof of concept.** Our Tier 3 semantic layer pipeline achieves 73% exact metric name match (92% including near-misses) on a real dataset.

---

## Core Capabilities

### 1. Ingest & Index (understand what exists)

Parse an existing LookML repo and build a searchable, LLM-queryable catalog:

- **Views:** All views, their SQL table references, dimensions, dimension groups, measures
- **Explores:** How views are joined, relationship types, access filters
- **Models:** Which explores are in which models, access grants, datagroups
- **Derived tables:** Native and SQL derived tables, their persistence strategy
- **Cross-references:** Which measures reference which dimensions, field-level lineage
- **Usage patterns:** (future) Which fields are actually used in dashboards/looks

**Output:** An internal representation (likely our existing semantic layer YAML format or an extended version) that the LLM can reason over efficiently.

### 2. Generate (create new LookML)

Take inputs and produce production-ready LookML:

**Inputs (any combination of):**
- Database schema (table DDL, column types)
- Sample SQL queries (analyst's existing work)
- Business documentation (wiki pages, data dictionaries, Confluence)
- Natural language description ("I need revenue metrics by product category")
- Existing LookML (the context of what already exists)

**Outputs:**
- LookML view files with dimensions, dimension groups, measures
- Explore definitions with joins
- Derived table SQL when needed
- Model file updates

**Quality targets:**
- Generated LookML passes `lookml-linter` and Looker's validator
- Metric names follow the team's existing naming conventions (learned from ingested LookML)
- Joins use correct relationship types (many_to_one, etc.)
- Proper use of `type:`, `sql:`, `label:`, `description:`, `group_label:`

### 3. Navigate & Recommend (find the right answer fast)

When an analyst gets a stakeholder request, the tool helps them figure out what to do:

- **"Does this metric already exist?"** — Search the catalog by concept, not just name
- **"What explore should I use for this?"** — Recommend based on the tables/fields needed
- **"What's missing?"** — Gap analysis: "You need a `product_category` dimension, which requires joining `dim_products`. Here's the LookML."
- **"Explain this measure."** — Show the SQL, the view it lives in, what explore exposes it, and what dashboards use it

### 4. Modify & Extend (evolve existing LookML)

Help analysts modify existing LookML safely:

- **Add a measure to an existing view** — "Add a count of distinct customers to the orders view"
- **Add a dimension group** — "Add a created_at time dimension with date, week, month, quarter, year"
- **Extend an explore** — "Join the products table to the orders explore"
- **Refactor** — "This derived table SQL is slow, optimize it" or "Extract this repeated logic into a common view"

---

## Architecture

### How It Maps to Existing Code

```
EXISTING CODE (reuse)              NEW CODE (build)
─────────────────────              ────────────────
Tier 3 pipeline                    LookML parser/reader
  SQL extraction agent      →      LookML output generator
  Business logic extraction →      LookML catalog/index
  Metric compilation        →      LookML validator

Multi-LLM support                  Request-to-LookML pipeline
  Claude, OpenAI, Gemini    →      Conversational interface

YAML config architecture           Git integration (LookML repos)
  Prompts, dialects         →      Looker API integration (future)

DuckDB SQL validation       →      LookML SQL validation
```

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LookML Workbench                          │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │  Ingest   │   │ Generate  │   │ Navigate  │   ← CLI/Web  │
│  │  & Index  │   │   New     │   │& Recommend│     Interface │
│  └────┬──────┘   └─────┬────┘   └─────┬─────┘              │
│       │                │              │                      │
│       ▼                ▼              ▼                      │
│  ┌──────────────────────────────────────────┐               │
│  │          LookML Knowledge Base            │               │
│  │  (parsed views, explores, measures,       │               │
│  │   dimensions, joins, naming conventions)  │               │
│  └──────────────────────┬───────────────────┘               │
│                         │                                    │
│       ┌─────────────────┼─────────────────┐                 │
│       ▼                 ▼                 ▼                  │
│  ┌─────────┐    ┌──────────────┐   ┌──────────┐            │
│  │ LookML  │    │  LLM Pipeline │   │  Schema  │            │
│  │ Parser  │    │  (Claude/     │   │  Reader  │            │
│  │         │    │   OpenAI/     │   │ (DB DDL) │            │
│  │         │    │   Gemini)     │   │          │            │
│  └─────────┘    └──────────────┘   └──────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
    LookML Repo                         Database
    (Git)                              (Snowflake, BQ, etc.)
```

---

## Implementation Phases

### Phase 1: LookML Parser & Knowledge Base

**Goal:** Read a LookML repo and build a structured, queryable representation.

**What to build:**
- LookML file parser (`.lkml` files → structured Python objects)
  - Views: name, sql_table_name, dimensions, dimension_groups, measures, sets, parameters
  - Explores: name, from, joins (with relationship, type, sql_on), access_filters
  - Models: name, includes, explores, datagroups
  - Derived tables: SQL and native, persistence settings
- Knowledge base store (probably SQLite + our YAML format)
  - Full-text search over field names, labels, descriptions, SQL expressions
  - Cross-reference index (which views are joined in which explores)
  - Naming convention extractor (detect patterns like `count_`, `total_`, `avg_` prefixes)

**Existing code to reuse:**
- `engine/semantic.py` — SemanticLayer model (extend for LookML concepts)
- `engine/config_loader.py` — YAML loading infrastructure
- `engine/schema.py` — Schema introspection patterns

**Key decision:** Use the existing `lkml` Python package (MIT license, parses LookML to dict) rather than writing our own parser. Focus our effort on the knowledge base and LLM integration, not parsing.

**Deliverable:** `lookml ingest /path/to/lookml-repo` → searchable catalog you can query from Python.

---

### Phase 2: LookML Generator

**Goal:** Generate valid LookML from schema + context.

**What to build:**
- LookML output templates (Jinja2 or string-based) for views, explores, models
- Adaptation of the Tier 3 pipeline:
  - Input: schema DDL + SQL queries + business docs (same as today)
  - Middle: LLM extracts business logic + naming conventions (same as today)
  - Output: LookML files instead of dbt MetricFlow YAML (new)
- LookML validator integration
  - Syntax validation (does it parse?)
  - Semantic validation (do referenced fields exist? are join relationships correct?)
- Naming convention adherence
  - If an existing LookML repo was ingested (Phase 1), learn its conventions
  - Apply them to generated output (e.g., if existing uses `count_distinct_` prefix, so should new measures)

**Existing code to reuse:**
- `engine/semantic_generator.py` — Tier 3 generation pipeline (retarget)
- `engine/metric_compiler.py` — Metric definition validation logic
- `engine/prompts/semantic/` — Generation prompts (adapt for LookML)
- `sources/*/dialect.yaml` — SQL dialect knowledge

**Deliverable:** `lookml generate --schema schema.sql --queries queries/ --docs wiki/` → valid LookML files.

---

### Phase 3: Conversational Interface

**Goal:** Natural language interaction for analysts.

**What to build:**
- CLI chat interface for LookML questions and generation
  - "What measures exist for revenue?" → searches catalog
  - "Generate a view for the new events table" → runs generator
  - "Add a count of distinct users to the orders view" → modifies existing LookML
  - "What explore should I use to analyze churn?" → recommends based on catalog
- Request analysis agent
  - Takes a stakeholder request ("VP needs revenue by region dashboard")
  - Searches the catalog for existing measures/explores
  - Identifies what's missing
  - Generates a plan: "These 3 measures exist. You need 1 new dimension and 1 new explore join."
- Modification agent
  - Takes existing LookML + modification request
  - Produces a diff (not a full rewrite)
  - Validates the result

**Existing code to reuse:**
- `engine/conversation.py` — Conversation state machine
- `engine/chart_conversation.py` — Phase-based conversation flow
- `engine/llm/` — All LLM providers
- `engine/pipeline/` — Multi-agent pipeline architecture

**Deliverable:** `lookml chat` → interactive session for LookML work.

---

### Phase 4: Web UI & Git Integration

**Goal:** Production-grade tool for teams.

**What to build:**
- Web UI for browsing the LookML catalog (metrics, dimensions, explores)
- Visual diff view for generated/modified LookML
- Git integration — commit generated LookML directly to the repo
- Looker API integration — validate against live Looker instance
- Team features — shared catalog, annotation, review workflow

**Existing code to reuse:**
- `app/` — Full React frontend (retarget for catalog browsing)
- `api/` — FastAPI backend (retarget for LookML operations)
- `app/src/stores/` — Zustand state management patterns

---

### Phase 5: AI-Powered Dashboard Layer (Future)

**Goal:** Full circle back to the original vision, but on solid foundations.

Once the semantic layer is solid:
- Users browse a metric catalog, select what they want to see
- The LLM conversation is highly structured: "Show me {metric} by {dimension} filtered by {filter}"
- SQL is compiled from metric definitions, never hallucinated
- Visualization is just the rendering layer — could be Plotly, could push to Looker itself
- This is where the existing React charting components come back into play

---

## What We Keep vs. Discard vs. Build

### Keep & Adapt
- `engine/llm/` — Multi-LLM provider support (Claude, OpenAI, Gemini)
- `engine/semantic_generator.py` — Tier 3 pipeline (retarget output to LookML)
- `engine/metric_compiler.py` — Validation logic for metric definitions
- `engine/prompts/` — YAML prompt architecture (write new prompts for LookML)
- `engine/config_loader.py` — Configuration loading
- `engine/sql_validator.py` — SQL validation (for derived table SQL)
- `engine/conversation.py` — Conversation patterns
- `engine/pipeline/` — Multi-agent pipeline architecture
- `sources/*/dialect.yaml` — SQL dialect knowledge per database

### Keep for Later (Phase 4-5)
- `app/` — React frontend (retarget for catalog UI)
- `api/` — FastAPI backend (retarget for LookML operations)
- `app/src/components/charts/` — Chart components (Phase 5)
- `engine/qa.py` — Visual QA (Phase 5)

### Build New
- LookML parser integration (using `lkml` package)
- LookML knowledge base / catalog store
- LookML output generator (view, explore, model file generation)
- LookML validator
- Naming convention learning/enforcement
- Request → LookML gap analysis agent
- LookML modification agent (edit existing, not just generate new)
- CLI interface (`lookml` command)

### Likely Discard
- `engine/chart_pipeline.py` — Chart-specific pipeline (replace with LookML pipeline)
- `engine/chart_conversation.py` — Chart conversation flow (replace with LookML flow)
- `engine/models/chart.py` — Chart models
- `engine/dashboard_composer.py` — Dashboard composition
- `engine/brand.py` — Branding
- `engine/templates/` — Chart/dashboard templates
- `engine/components/` — Chart component definitions
- `engine/styles/` — Chart styling

---

## Success Criteria

### Phase 1 (Parser)
- Can ingest a real-world LookML repo (50+ views) in under 30 seconds
- All views, explores, dimensions, measures correctly parsed
- Full-text search returns relevant results for concept queries

### Phase 2 (Generator)
- Generated LookML passes `lookml-linter` with zero errors
- 80%+ of generated measures have correct SQL and type
- Generated naming conventions match existing repo patterns when available
- Generates valid join relationships with correct `relationship:` types

### Phase 3 (Conversational)
- Analyst can go from "VP needs revenue by region" to "here's the LookML you need" in under 2 minutes
- Tool correctly identifies existing measures 90%+ of the time
- Modification suggestions produce valid diffs

### Phase 4 (Production)
- Team of 5+ analysts using it weekly
- Measurable reduction in time from request to LookML PR
- Zero LookML syntax errors reaching Looker validation

---

## Open Questions

1. **LookML version targeting.** Looker has evolved its LookML syntax over the years. Which version(s) do we target? Probably latest (Looker 24+), but need to handle legacy patterns in existing repos.

2. **Derived tables strategy.** Derived tables are a big part of real-world LookML. How much do we invest in generating/optimizing SQL derived tables vs. encouraging native derived tables vs. just generating basic views?

3. **Looker API integration priority.** Direct Looker API access would let us validate generated LookML against the live instance, see which fields are actually used in dashboards, etc. But it adds complexity and auth requirements. Phase 4 or earlier?

4. **Multi-dialect SQL.** LookML `sql:` blocks can reference `${TABLE}` and Looker-specific SQL. We need to handle the dialect differences between Snowflake, BigQuery, Redshift, Postgres, etc. Our existing `dialect.yaml` system is a starting point.

5. **Testing strategy.** How do we test generated LookML without a Looker instance? Options: parse validation only, Spectacles integration, or mock Looker validation.

---

*Document updated: 2026-02-09 — Pivoted from dashboard builder to LookML workbench*
*Previous plan (React chart rendering migration) archived in git history*
