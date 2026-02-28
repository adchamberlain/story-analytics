# Story Analytics API

REST API for creating data-driven charts and dashboards programmatically.

**Base URL:** `https://your-instance.com/api`
**Interactive docs:** `/docs` (Swagger UI) or `/redoc` (ReDoc)

---

## Authentication

Three methods, checked in order:

### 1. API Key (recommended for scripts)

```bash
# Header (preferred)
curl -H "X-API-Key: sa_live_..." https://your-instance.com/api/v2/charts/

# Query parameter
curl "https://your-instance.com/api/v2/charts/?api_key=sa_live_..."
```

API keys start with `sa_live_` and are created in **Settings > API Keys** or via the API. The full key is shown only once at creation.

### 2. JWT Bearer Token

```bash
curl -H "Authorization: Bearer <token>" https://your-instance.com/api/v2/charts/
```

Obtain a token via `POST /api/auth/login`. Tokens expire after 72 hours.

### 3. No Auth (local dev)

When `AUTH_ENABLED=false` (default for local development), all requests use a default user. No headers needed.

---

## Quick Start

Upload a CSV, propose a chart with AI, and save it — all in three requests:

```bash
API_KEY="sa_live_your_key_here"
BASE="https://your-instance.com/api"

# 1. Upload data
curl -X POST "$BASE/data/upload" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@sales.csv"
# → {"source_id": "abc123def456", "filename": "sales.csv", "row_count": 500, ...}

# 2. AI-propose a chart
curl -X POST "$BASE/v2/charts/propose" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_id": "abc123def456", "user_hint": "monthly revenue trend"}'
# → {"config": {"chart_type": "LineChart", "title": "Monthly Revenue", ...}, "sql": "SELECT ...", ...}

# 3. Save the chart
curl -X POST "$BASE/v2/charts/save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_id": "abc123def456",
    "chart_type": "LineChart",
    "title": "Monthly Revenue",
    "sql": "SELECT month, SUM(revenue) as revenue FROM src_abc123def456 GROUP BY month ORDER BY month",
    "x": "month",
    "y": "revenue"
  }'
# → {"id": "a1b2c3d4e5f6", "status": "draft", ...}
```

---

## Data Sources

### Upload CSV

```
POST /api/data/upload
Content-Type: multipart/form-data
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | CSV file (max 100 MB) |
| `replace` | string | `"true"` to replace existing file with same name |

**Response:**
```json
{
  "source_id": "abc123def456",
  "filename": "sales.csv",
  "row_count": 500,
  "columns": [
    {
      "name": "revenue",
      "type": "DOUBLE",
      "nullable": true,
      "sample_values": ["1234.56", "7890.12"],
      "null_count": 0,
      "distinct_count": 450
    }
  ]
}
```

If a file with the same name exists, returns `409` with `{"code": "DUPLICATE_FILENAME", "existing_source_id": "..."}`.

### Paste Data

```
POST /api/data/paste
{"data": "name,value\nAlice,100\nBob,200", "name": "my-data"}
```

Accepts CSV or TSV text (max 50 KB).

### Import from URL

```
POST /api/data/import/url
{"url": "https://example.com/data.csv", "headers": {"Authorization": "Bearer ..."}}
```

Supports CSV files and JSON arrays. Custom headers optional for authenticated sources.

### Import from Google Sheets

```
POST /api/data/import/google-sheets
{"url": "https://docs.google.com/spreadsheets/d/.../edit"}
```

Sheet must be publicly shared.

### Query Data

```
POST /api/data/query
{"source_id": "abc123def456", "sql": "SELECT name, SUM(revenue) FROM {{source}} GROUP BY name"}
```

Use `{{source}}` as the table placeholder — it's replaced with the actual DuckDB table name. Only `SELECT`/`WITH`/`EXPLAIN` allowed. Auto-limited to 10,000 rows.

**Response:**
```json
{
  "columns": ["name", "revenue"],
  "rows": [{"name": "Alice", "revenue": 1500}],
  "row_count": 1
}
```

### Other Data Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/data/sources` | List all data sources |
| `GET` | `/data/schema/{source_id}` | Get column types and stats |
| `GET` | `/data/preview/{source_id}?limit=10` | Preview first N rows |
| `PATCH` | `/data/sources/{source_id}/rename` | Rename source (`{"name": "..."}`) |
| `DELETE` | `/data/sources/{source_id}` | Delete source and its data |

### Data Transforms

All transforms modify the CSV in-place and return a preview of the updated data.

| Method | Path | Body |
|--------|------|------|
| `POST` | `/data/{source_id}/transform/rename-column` | `{"old": "col1", "new": "column_one"}` |
| `POST` | `/data/{source_id}/transform/delete-column` | `{"column": "col1"}` |
| `POST` | `/data/{source_id}/transform/reorder-columns` | `{"columns": ["c", "a", "b"]}` |
| `POST` | `/data/{source_id}/transform/transpose` | _(no body)_ |
| `POST` | `/data/{source_id}/transform/round` | `{"column": "price", "decimals": 2}` |
| `POST` | `/data/{source_id}/transform/prepend-append` | `{"column": "name", "prepend": "$"}` |
| `POST` | `/data/{source_id}/transform/edit-cell` | `{"row": 0, "column": "name", "value": "Alice"}` |
| `POST` | `/data/{source_id}/transform/cast-type` | `{"column": "year", "type": "number"}` |

---

## Charts

### Create a Chart

```
POST /api/v2/charts/save
```

```json
{
  "source_id": "abc123def456",
  "chart_type": "BarChart",
  "title": "Top Products",
  "subtitle": "By revenue, Q1 2026",
  "source": "Internal sales data",
  "sql": "SELECT product, SUM(revenue) as revenue FROM src_abc123def456 GROUP BY product ORDER BY revenue DESC LIMIT 10",
  "x": "product",
  "y": "revenue",
  "series": null,
  "horizontal": false,
  "sort": true,
  "config": {
    "palette": "default",
    "showGrid": true,
    "showLegend": true,
    "showValues": false,
    "xAxisTitle": "Product",
    "yAxisTitle": "Revenue ($)"
  }
}
```

**Chart types:** `BarChart`, `LineChart`, `AreaChart`, `ScatterPlot`, `PieChart`, `Histogram`, `HeatMap`, `BoxPlot`, `DotPlot`, `RangePlot`, `BulletBar`, `ArrowPlot`, `SplitBars`, `Treemap`, `SmallMultiples`, `GroupedColumn`, `StackedColumn`, `DataTable`, `SpikeMap`, `BigValue`, `ChoroplethMap`, `SymbolMap`, `LocatorMap`, `ElectionDonut`, `MultiplePies`

### AI Propose a Chart

```
POST /api/v2/charts/propose
{"source_id": "abc123def456", "user_hint": "show me revenue by region"}
```

Returns a complete chart config, SQL query, and data — ready to save. The `user_hint` is optional; without it the AI picks the most interesting visualization.

### Build a Query (Deterministic)

```
POST /api/v2/charts/build-query
{
  "source_id": "abc123def456",
  "x": "month",
  "y": "revenue",
  "series": "region",
  "aggregation": "sum",
  "time_grain": "month"
}
```

Builds a SQL query deterministically (no AI). Supports multi-Y with automatic UNPIVOT. Aggregations: `none`, `sum`, `avg`, `median`, `count`, `min`, `max`. Time grains: `none`, `day`, `week`, `month`, `quarter`, `year`.

### AI Edit a Chart

```
POST /api/v2/charts/edit
{
  "chart_id": "a1b2c3d4e5f6",
  "message": "Make it horizontal and sort descending",
  "current_config": { ... },
  "columns": ["product", "revenue"]
}
```

Returns an updated config based on natural language instructions.

### Get Chart with Data

```
GET /api/v2/charts/{chart_id}
```

Re-executes the chart's SQL and returns both metadata and data:

```json
{
  "chart": {
    "id": "a1b2c3d4e5f6",
    "chart_type": "BarChart",
    "title": "Top Products",
    "sql": "SELECT ...",
    "status": "draft",
    ...
  },
  "data": [{"product": "Widget A", "revenue": 50000}, ...],
  "columns": ["product", "revenue"]
}
```

### Other Chart Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v2/charts/` | List all charts (`?status=active\|archived\|all`) |
| `PUT` | `/v2/charts/{id}` | Update chart fields |
| `DELETE` | `/v2/charts/{id}` | Delete chart |
| `POST` | `/v2/charts/{id}/duplicate` | Duplicate chart |
| `PUT` | `/v2/charts/{id}/publish` | Publish (make embeddable) |
| `PUT` | `/v2/charts/{id}/unpublish` | Unpublish |
| `PUT` | `/v2/charts/{id}/archive` | Archive |
| `PUT` | `/v2/charts/{id}/restore` | Restore from archive |
| `GET` | `/v2/charts/{id}/public` | Get published chart (no auth) |
| `GET` | `/v2/charts/{id}/data.csv` | Download data as CSV |
| `GET` | `/v2/charts/ai-status` | Check if AI features available |

### Chart Versioning

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v2/charts/{id}/versions` | Create version (`{"trigger": "manual", "label": "..."}`) |
| `GET` | `/v2/charts/{id}/versions` | List versions (newest first) |
| `GET` | `/v2/charts/{id}/versions/{v}` | Get version with full chart data |
| `POST` | `/v2/charts/{id}/versions/{v}/restore` | Restore to version (auto-creates safety snapshot) |
| `DELETE` | `/v2/charts/{id}/versions/{v}` | Delete version |

Auto-prunes at 50 versions per chart.

---

## Dashboards

### Create a Dashboard

```
POST /api/v2/dashboards/
{
  "title": "Q1 Sales Dashboard",
  "description": "Key metrics and trends",
  "charts": [
    {"chart_id": "chart1", "width": "full"},
    {"chart_id": "chart2", "width": "half"},
    {"chart_id": "chart3", "width": "half"}
  ],
  "filters": [
    {
      "name": "date_range",
      "filterType": "dateRange",
      "dateColumn": "date",
      "defaultStart": "2026-01-01",
      "defaultEnd": "2026-03-31"
    }
  ]
}
```

Chart `width`: `"full"` or `"half"`. Filters support `dateRange`, `dropdown`, and `range` types.

### Get Dashboard with Data

```
GET /api/v2/dashboards/{id}
```

Re-executes each chart's SQL and returns the dashboard with all chart data. Accepts an optional `?filters=<JSON>` query parameter for dashboard-level filtering.

### Other Dashboard Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v2/dashboards/` | List dashboards |
| `PUT` | `/v2/dashboards/{id}` | Update dashboard |
| `DELETE` | `/v2/dashboards/{id}` | Delete dashboard |
| `PUT` | `/v2/dashboards/{id}/publish` | Publish |
| `PUT` | `/v2/dashboards/{id}/unpublish` | Unpublish |
| `GET` | `/v2/dashboards/{id}/public` | Get published (no auth) |
| `GET` | `/v2/dashboards/{id}/export/html` | Export to self-contained HTML |
| `POST` | `/v2/dashboards/{id}/health-check` | Check chart health |
| `GET` | `/v2/dashboards/{id}/health` | Get cached health results |
| `GET` | `/v2/dashboards/{id}/sharing` | Get sharing settings |
| `PUT` | `/v2/dashboards/{id}/sharing` | Update visibility (private/team/public) |

---

## Folders

Organize charts into folders (with nesting support).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/folders/` | Create folder (`{"name": "...", "parent_id": null}`) |
| `GET` | `/folders/` | List folders |
| `PUT` | `/folders/{id}` | Update folder |
| `DELETE` | `/folders/{id}` | Delete folder (charts are NOT deleted) |
| `GET` | `/folders/{id}/charts` | List charts in folder |

Move a chart to a folder via `PUT /api/v2/charts/{id}` with `{"folder_id": "..."}`.

---

## Teams

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/teams/` | Create team (creator becomes admin) |
| `GET` | `/teams/` | List user's teams |
| `GET` | `/teams/{id}` | Get team with members |
| `POST` | `/teams/{id}/invite` | Invite by email (registered users only) |
| `POST` | `/teams/{id}/members` | Add member by user ID (admin only) |
| `DELETE` | `/teams/{id}/members/{uid}` | Remove member (admin only) |
| `GET` | `/teams/{id}/invites` | List pending invites |
| `DELETE` | `/teams/{id}/invites/{invite_id}` | Cancel pending invite |
| `DELETE` | `/teams/{id}` | Delete team (owner only) |

---

## Database Connections

Connect to external databases (Snowflake, PostgreSQL, BigQuery) and sync tables into DuckDB.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/connections/types` | List supported connector types |
| `POST` | `/connections/` | Create connection |
| `GET` | `/connections/` | List connections |
| `GET` | `/connections/{id}` | Get connection by ID |
| `POST` | `/connections/{id}/test` | Test connection |
| `POST` | `/connections/{id}/tables` | List available tables |
| `POST` | `/connections/{id}/schema` | Full schema introspection (`?refresh=true` to bypass cache) |
| `POST` | `/connections/{id}/query` | Execute read-only SQL against warehouse |
| `POST` | `/connections/{id}/sync` | Sync tables into DuckDB |
| `POST` | `/connections/{id}/sync-query` | Sync query result into DuckDB as new source |
| `DELETE` | `/connections/{id}` | Delete connection |

---

## API Key Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api-keys/` | Create key (`{"name": "...", "scopes": "read,write"}`) |
| `GET` | `/api-keys/` | List keys (full key never shown again) |
| `DELETE` | `/api-keys/{id}` | Revoke key |

---

## Themes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/themes/` | Create theme |
| `GET` | `/themes/` | List themes |
| `GET` | `/themes/{id}` | Get theme |
| `PUT` | `/themes/{id}` | Update theme |
| `DELETE` | `/themes/{id}` | Delete theme |

---

## Auth

Authentication endpoints (email + password with JWT).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/status` | Auth status and current user info |
| `POST` | `/auth/register` | Register with email + password (accepts optional `invite_token`) |
| `POST` | `/auth/login` | Login with email + password → returns JWT |
| `POST` | `/auth/change-password` | Change password (requires current password) |
| `POST` | `/auth/forgot-password` | Request password reset email |
| `POST` | `/auth/reset-password` | Reset password using token |
| `PUT` | `/auth/profile` | Update display name |

Legacy magic-link endpoints (`POST /auth/magic-link`, `GET /auth/verify`) are also available.

---

## Admin

All admin endpoints require the `admin` role.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List all users |
| `PUT` | `/admin/users/{id}/role` | Change user role (admin/editor) |
| `PUT` | `/admin/users/{id}/status` | Activate or deactivate user |
| `DELETE` | `/admin/users/{id}` | Permanently delete user |
| `POST` | `/admin/invites` | Create invite link |
| `GET` | `/admin/invites` | List pending invites |
| `DELETE` | `/admin/invites/{id}` | Revoke invite |
| `GET` | `/admin/settings` | Get admin settings (e.g. `open_registration`) |
| `PUT` | `/admin/settings` | Update admin settings |

---

## Comments

Threaded comments on charts and dashboards.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/comments/` | Add comment (`{"chart_id": "..."}` or `{"dashboard_id": "..."}`) |
| `GET` | `/comments/?chart_id=...` | List comments for a chart or dashboard |
| `PUT` | `/comments/{id}` | Edit comment (author only) |
| `DELETE` | `/comments/{id}` | Soft-delete comment (author only) |

---

## Notifications

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications/` | List recent notifications |
| `GET` | `/notifications/unread-count` | Get unread count |
| `PUT` | `/notifications/{id}/read` | Mark notification as read |
| `PUT` | `/notifications/read-all` | Mark all as read |

---

## Templates

Reusable chart configuration templates.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v2/templates/` | Create template |
| `GET` | `/v2/templates/` | List templates |
| `GET` | `/v2/templates/{id}` | Get template |
| `PUT` | `/v2/templates/{id}` | Update template |
| `DELETE` | `/v2/templates/{id}` | Delete template |

Charts can also be saved as templates via `POST /v2/charts/{id}/save-as-template`.

---

## Settings

AI provider configuration.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/` | Get AI provider settings (API keys masked) |
| `PUT` | `/settings/` | Update provider and API keys |
| `GET` | `/settings/sources` | List all data sources (connections + CSVs) |

---

## Error Responses

All errors return JSON with a `detail` field:

```json
{"detail": "Human-readable error message"}
```

| Code | Meaning |
|------|---------|
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid/missing auth) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (e.g., duplicate filename) |
| 422 | Unprocessable (e.g., SQL execution failed) |
| 503 | Service unavailable (e.g., AI not configured) |

---

## Limits

- **File uploads:** 100 MB max
- **Pasted data:** 50 KB max
- **SQL queries:** SELECT/WITH/EXPLAIN only, auto-limited to 10,000 rows
- **Chart versions:** Auto-pruned at 50 per chart
- **JWT tokens:** Expire after 72 hours
