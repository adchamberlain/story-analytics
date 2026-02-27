# Lessons Learned

> Read this file at every session start. Update after every correction or bug found.

## Observable Plot Quirks
- Ordinal x-axis sorts alphabetically by default; must set explicit `x: { domain: [...] }` preserving data order
- Built-in `color: { legend: true }` unreliable for stroke-based marks (line/area); use custom React legend
- Y-axis `label`/`labelOffset`/`marginLeft` overlaps tick values; use `appendYAxisLabel()` with manual SVG text
- Plot.tip() is the standard tooltip mark; use Plot.pointer() for hover detection

## Python Gotchas
- `rf"\n"` is literal backslash-n, not newline; use `f"\n"` for actual newlines in re.sub replacements

## Architecture Patterns
- Chart storage: JSON files in `data/charts/{id}.json`, 12-char hex IDs, atomic writes via tempfile
- Dashboard storage: Same pattern in `data/dashboards/`
- API pattern: Pydantic models → router endpoint → service function → JSON storage
- Frontend state: Zustand stores, `useEditorStore` for chart config, `useLibraryStore` for library
- Chart rendering: ObservableChartFactory dispatches by chartType via `buildMarks()` switch
- Non-Plot charts (BigValue, DataTable, PieChart, Treemap): rendered as React components, not Plot marks

## Testing Patterns
- Backend: `TestClient(app)` from FastAPI, create → test → cleanup pattern
- Frontend: Vitest + Testing Library, test formatters and utils directly
- Screenshots: Playwright captures to `tasks/screenshots/`, Claude reads PNGs for visual review
- Always validate ID format: `^[a-f0-9]{1,32}$`

## Visual Quality Standards
- Publication-ready = clean, minimal, readable at any size
- Always check dark mode rendering
- Always check at both 1280px (desktop) and 375px (mobile) widths
- Chart should fill container, not float tiny in a large space
- Axis labels should never overlap or clip

## AWS Deployment Rules

### The Two Deploy Commands
- **`deploy.cli update`** = rebuild Docker image + push to ECR + trigger App Runner redeploy. **Does NOT change env vars or CloudFormation config.** Use this for code changes only.
- **`deploy.cli deploy`** = full CloudFormation stack update. Changes env vars, password, instance config. Use this for config changes.
- **NEVER use `aws rds modify-db-instance`, `aws apprunner update-service`, or any direct AWS CLI to change config.** These go out of sync with CloudFormation and create rollback loops. Always use `deploy.cli deploy` for config changes.

### RDS PostgreSQL 16 SSL Requirement
- `rds.force_ssl=1` is the default for PostgreSQL 16. Cannot be changed on the default parameter group.
- DATABASE_URL **must** include `?sslmode=require`. Without it, connections fail with `no pg_hba.conf entry ... no encryption`.
- This is already set in `deploy/cloudformation.yaml`. Do not remove it.

### App Runner Rollback Catch-22
- If a deploy fails, App Runner rolls back **BOTH the Docker image AND env vars** to the previous working state.
- This means you cannot fix a broken config by pushing another update — the fix gets rolled back too.
- **If you enter a rollback loop (3+ consecutive rollbacks), STOP.** The only reliable fix is:
  1. `python3 -m deploy.cli destroy --region us-east-2 --yes`
  2. `python3 -m deploy.cli deploy --region us-east-2` (fresh deploy)
  3. Update DNS (App Runner URL changes on fresh deploy)
- Do NOT waste time trying `aws rds modify-db-instance` or `aws apprunner update-service` — they make it worse.

### Connection Reliability
- psycopg2 connections must use `connect_timeout=10` (set in `connection.py`). Without it, connection failures hang forever with no error logs.
- Check App Runner logs after failure: `aws logs get-log-events --log-group-name '/aws/apprunner/...'`

### S3 Bucket Cleanup
- CloudFormation cannot delete non-empty versioned S3 buckets. The `destroy_stack()` function in `deploy/aws.py` handles this automatically by emptying the bucket first.

## Common Mistakes
- Changing RDS password directly via AWS CLI → password mismatch with App Runner → rollback loop (happened Feb 26 + Feb 27, 2026)
- Trying to fix a rollback loop by pushing more updates → makes it worse. Must do full destroy + redeploy.
- Forgetting `?sslmode=require` in DATABASE_URL → silent connection failures on RDS PostgreSQL 16
