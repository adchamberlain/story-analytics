# LLM Context Architecture for Customer Onboarding

> Design notes for scaling Story Analytics to new customers with their own Snowflake data. These are design notes only -- none of this has been built yet. 

## Problem Statement

When onboarding a new customer with new data tables in Snowflake:
- They choose which schemas the LLM has access to
- The LLM needs to understand tables and columns to write competent SQL
- Dashboard quality is only as good as the LLM's understanding of the data

**Key question**: How do we give the LLM maximum context about a user's data (golden queries, documentation, Airflow DAGs, etc.) at scale?

---

## Current Architecture

| Layer | Implementation | Location |
|-------|----------------|----------|
| **Schema Discovery** | Dynamic introspection - tables, columns, types, sample values | `engine/schema.py` |
| **SQL Dialect** | Per-source rules for allowed/forbidden functions | `sources/{source}/dialect.yaml` |
| **Prompts** | Config-driven YAML templates | `engine/prompts/*.yaml` |
| **Validation** | SQL validator + QA vision loop | `engine/sql_validator.py` |

**Gap**: Schema introspection tells the LLM *what* exists, but not *what it means* or *how to use it well*.

---

## Proposed Architecture: Context Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: GOLDEN QUERIES (highest signal)                   │
│  - Curated SQL examples that "just work"                    │
│  - Annotated with business intent                           │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: SEMANTIC METADATA                                 │
│  - Column descriptions & business definitions               │
│  - Relationships between tables (FK hints)                  │
│  - Common joins and aggregation patterns                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: DATA LINEAGE (optional enrichment)                │
│  - Airflow DAG descriptions                                 │
│  - dbt model docs                                           │
│  - Data freshness / update schedules                        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: SCHEMA INTROSPECTION (current - automatic)        │
│  - Tables, columns, types, sample values                    │
│  - Row counts                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Semantic Metadata File

Add `metadata.yaml` alongside each source:

```yaml
# sources/snowflake_saas/metadata.yaml

tables:
  customers:
    description: "Master customer table - one row per customer account"
    business_owner: "Sales team"
    primary_key: id
    relationships:
      - references: invoices.customer_id
      - references: events.customer_id
    columns:
      mrr:
        description: "Monthly Recurring Revenue in USD"
        business_definition: "Sum of all active subscription amounts"
        common_filters: ["mrr > 0 for paying customers"]
      created_at:
        description: "Account creation timestamp"
        typical_aggregations: ["DATE_TRUNC('month', created_at) for cohorts"]

  invoices:
    description: "All billing invoices - can have multiple per customer"
    grain: "One row per invoice"
    columns:
      amount:
        description: "Invoice amount in USD before tax"
        notes: "Use SUM(amount) for revenue calculations"

common_patterns:
  - name: "Monthly Revenue"
    sql: |
      SELECT DATE_TRUNC('month', created_at) as month,
             SUM(amount) as revenue
      FROM snowflake_saas.invoices
      GROUP BY 1
  - name: "Customer Cohort"
    sql: |
      SELECT DATE_TRUNC('month', c.created_at) as cohort_month,
             COUNT(DISTINCT c.id) as customers
      FROM snowflake_saas.customers c
      GROUP BY 1
```

### 2. Golden Queries Library

```yaml
# sources/snowflake_saas/golden_queries.yaml

queries:
  - intent: "Show revenue over time"
    tags: [revenue, time-series, invoices]
    sql: |
      SELECT
        DATE_TRUNC('month', created_at) as month,
        SUM(amount) as total_revenue,
        COUNT(*) as invoice_count
      FROM snowflake_saas.invoices
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1
    notes: "Always filter to reasonable time range for performance"

  - intent: "Customer retention by cohort"
    tags: [retention, cohorts, customers]
    sql: |
      WITH cohorts AS (
        SELECT
          id,
          DATE_TRUNC('month', created_at) as cohort_month
        FROM snowflake_saas.customers
      )
      SELECT
        cohort_month,
        COUNT(DISTINCT c.id) as customers,
        SUM(CASE WHEN i.created_at IS NOT NULL THEN 1 ELSE 0 END) as with_invoice
      FROM cohorts c
      LEFT JOIN snowflake_saas.invoices i ON c.id = i.customer_id
      GROUP BY 1
    notes: "This pattern works for any cohort analysis"
```

### 3. Lineage Integration (Optional)

For customers with Airflow/dbt:

```yaml
# sources/customer_x/lineage.yaml

tables:
  dim_customers:
    source: "Airflow DAG: etl_customers_daily"
    upstream: ["raw.salesforce_accounts", "raw.stripe_customers"]
    refresh_schedule: "Daily at 6am UTC"
    freshness_sla: "24 hours"
    dbt_model: "models/marts/dim_customers.sql"

  fct_orders:
    source: "Airflow DAG: etl_orders_hourly"
    notes: "Combines Shopify and manual orders"
    known_issues: "Refunds appear as negative amounts"
```

### 4. Smart Context Assembly

Modify `config_loader.py` to include new layers:

```python
def get_full_context(source_name: str, user_request: str) -> str:
    """Assemble context with all available layers."""

    context_parts = []

    # Layer 1: Schema (current)
    context_parts.append(schema.get_schema_context())

    # Layer 2: Semantic metadata (if exists)
    metadata_path = f"sources/{source_name}/metadata.yaml"
    if os.path.exists(metadata_path):
        metadata = load_yaml(metadata_path)
        context_parts.append(format_metadata_for_llm(metadata))

    # Layer 3: Relevant golden queries (semantic search)
    golden_path = f"sources/{source_name}/golden_queries.yaml"
    if os.path.exists(golden_path):
        golden = load_yaml(golden_path)
        relevant = find_relevant_queries(golden, user_request, top_k=3)
        context_parts.append(format_golden_queries(relevant))

    return "\n\n".join(context_parts)
```

---

## Customer Onboarding Flow

```
Step 1: Connect Snowflake (required)
├── Customer provides credentials
├── Selects schemas to expose
├── Auto-generates: connection.yaml, basic dialect.yaml
└── Auto-introspects: schema with sample values

Step 2: Enrich Metadata (recommended)
├── UI to add column descriptions
├── Or: Import from Snowflake COMMENT fields
├── Or: Import from dbt schema.yml
└── Generates: metadata.yaml

Step 3: Seed Golden Queries (high impact)
├── Customer pastes their best SQL examples
├── Or: Import from query history (Snowflake query_history)
├── Tag with intent/business purpose
└── Generates: golden_queries.yaml

Step 4: Optional Deep Integration
├── Connect Airflow API for DAG metadata
├── Connect dbt Cloud for model docs
├── Connect data catalog (Atlan, Monte Carlo, etc.)
└── Generates: lineage.yaml
```

---

## Context Window Management

As context grows, strategies to stay within token limits:

1. **Semantic retrieval for golden queries** - Only include queries relevant to the user's request (use embeddings)
2. **Table relevance filtering** - If user mentions "revenue", only include tables likely to have revenue data
3. **Progressive disclosure** - Start with summaries, let LLM request more detail

---

## Storage Options

| Option | Pros | Cons |
|--------|------|------|
| **YAML files (current)** | Simple, version-controlled, portable | Manual management |
| **Database tables** | Queryable, UI-editable | More infrastructure |
| **Snowflake itself** | Use COMMENT on columns | Limited structure |

**Recommendation**: Start with YAML (current pattern), add a simple UI for editing. Migrate to database when multi-tenancy is needed.

---

## Feedback Loop

Capture user corrections to improve context over time:

```yaml
# Auto-generated from user feedback
corrections:
  - original_intent: "total revenue"
    wrong_assumption: "SUM(invoices.amount)"
    correct_approach: "SUM(customers.mrr)"
    learned_at: "2024-01-15"
```

---

## Quick Wins (Priority Order)

1. **Pull Snowflake COMMENTs** - If customers already have column comments in Snowflake, introspect those too
2. **Add `metadata.yaml` support** - Simple file, huge impact on LLM understanding
3. **Few-shot golden queries** - Even 3-5 example queries dramatically improve output quality

---

## Related Files

- Schema introspection: `engine/schema.py`
- Config loading: `engine/config_loader.py`
- System prompt assembly: `engine/conversation.py`
- SQL validation: `engine/sql_validator.py`
- Prompt templates: `engine/prompts/*.yaml`
- Dialect rules: `sources/{source}/dialect.yaml`
- Component docs: `engine/components/evidence.yaml`
