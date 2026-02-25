# Self-Hosted Cloud Deployment Design

**Date:** 2026-02-25
**Status:** Approved

## Goal

Add a "cloud mode" to Story Analytics so users can deploy the full app to their own AWS account with a single command. This unlocks the key Datawrapper value props — persistent URLs, team collaboration, iframe embedding — while keeping the app free and open-source (users own their infrastructure).

## Architecture Overview

```
User runs: story-analytics deploy --aws
         │
         ▼
   CloudFormation Stack
   ┌─────────────────────────────────────────┐
   │                                         │
   │  ┌──────────────┐   ┌───────────────┐   │
   │  │  App Runner   │──▶│  S3 Bucket    │   │
   │  │  (API + SPA)  │   │  (charts,     │   │
   │  │  Docker image  │   │   uploads,    │   │
   │  │  from ECR     │   │   snapshots)  │   │
   │  └──────┬───────┘   └───────────────┘   │
   │         │                                │
   │         ▼                                │
   │  ┌──────────────┐                        │
   │  │  RDS Postgres │                        │
   │  │  (metadata,   │                        │
   │  │   users, auth)│                        │
   │  └──────────────┘                        │
   │                                         │
   └─────────────────────────────────────────┘
```

Two modes, selected by environment:
- **Local mode** (default): File system storage + SQLite. Current behavior, zero changes.
- **Cloud mode**: S3 storage + RDS Postgres. Enabled via environment variables.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compute | AWS App Runner | Simplest managed container service. No VPC/ALB/subnet config needed for the app itself. Ideal for semi-technical users (academics, analysts). |
| File storage | S3 | Durable, cheap, built-in backups. Cloud-native approach vs EBS volumes. |
| Database | RDS Postgres (db.t4g.micro) | SQLAlchemy already abstracts SQL dialect. Managed service = no DB ops. ~$12/mo. |
| Auth | Built-in JWT (existing) | Already implemented, just needs enabling. No external auth service dependency. |
| Container | Single image (API + SPA) | FastAPI serves both /api routes and built React SPA. One container = one App Runner service = simple. |
| IaC | CloudFormation | Native AWS, no extra tooling. Single template creates entire stack. |

## Component Designs

### 1. Storage Abstraction Layer

Abstract all file I/O behind a `StorageBackend` interface so the same API code works against local disk or S3.

```python
class StorageBackend(ABC):
    async def read(self, path: str) -> bytes
    async def write(self, path: str, data: bytes) -> None
    async def delete(self, path: str) -> None
    async def list(self, prefix: str) -> list[str]
    async def exists(self, path: str) -> bool
```

**Implementations:**
- `LocalStorageBackend` — wraps current file I/O with atomic temp-file-then-rename. Base directory: `./data/`.
- `S3StorageBackend` — uses `boto3`. Path mapping: `charts/abc123.json` → `s3://{bucket}/charts/abc123.json`.

**Selection:** Environment variable `STORAGE_BACKEND=local` (default) or `STORAGE_BACKEND=s3` (requires `S3_BUCKET`).

**Paths to migrate:**
- `data/charts/` — chart config JSON files
- `data/dashboards/` — dashboard config JSON files
- `data/uploads/` — user CSV uploads
- `data/themes/` — custom themes
- `data/templates/` — chart templates
- `data/versions/` — edit history snapshots
- `data/snapshots/` — PNG fallbacks
- `data/settings.json` — app settings

### 2. Database Abstraction (SQLite → Postgres)

SQLAlchemy already handles dialect differences for ORM queries. Changes needed:

- `DATABASE_URL` env var: `sqlite:///data/metadata.db` → `postgresql://user:pass@host/dbname`
- Audit raw SQL for SQLite-specific syntax (`AUTOINCREMENT` → `SERIAL`, `datetime('now')` → `now()`)
- Add `psycopg2-binary` to requirements.txt
- Table creation uses SQLAlchemy `create_all()` — dialect-agnostic

**Local mode:** SQLite continues unchanged. No migration needed.

### 3. Production Docker Image

Multi-stage build — single image serves everything:

```dockerfile
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# Stage 2: Python API + built SPA
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/ ./api/
COPY engine/ ./engine/
COPY --from=frontend /app/dist ./static/
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

FastAPI addition: mount `./static/` as static files, catch-all route serves `index.html` for SPA routing.

### 4. CloudFormation Template

Single template (`deploy/cloudformation.yaml`) creates:

1. **ECR Repository** — Docker image registry
2. **S3 Bucket** — private, for chart data/uploads/snapshots
3. **RDS Postgres** — db.t4g.micro, private subnet, auto-generated password via Secrets Manager
4. **VPC + Private Subnets** — networking for RDS (App Runner connects via VPC Connector)
5. **VPC Connector** — lets App Runner reach RDS
6. **App Runner Service** — container config, environment variables, auto-TLS
7. **IAM Roles** — App Runner → S3 access, App Runner → ECR pull

**Parameters:**
- `StackName` (default: `story-analytics`)
- `Region` (default: `us-east-1`)
- `InstanceSize` (default: `db.t4g.micro`)
- `AdminEmail` — for initial admin account

**Outputs:**
- App URL (`https://{id}.{region}.awsapprunner.com`)
- S3 bucket name
- RDS endpoint (for debugging)

### 5. CLI Deploy Command

```bash
# First deploy
story-analytics deploy --aws --region us-east-1

# Update (new code)
story-analytics deploy --aws --update

# Tear down
story-analytics deploy --aws --destroy
```

**Deploy flow:**
1. Validate AWS credentials (`aws sts get-caller-identity`)
2. Build Docker image (multi-stage: frontend + backend)
3. Create ECR repo if needed, push image
4. Deploy/update CloudFormation stack
5. Wait for completion (~5-8 min first time, ~2-3 min updates)
6. Output URL + admin credentials

**Implementation:** Python script using `boto3` (CloudFormation client, ECR client). Lives in `deploy/aws.py`.

## Cost Estimate (Cloud Mode)

| Service | Monthly Cost |
|---------|-------------|
| App Runner (1 vCPU, 2GB, low traffic) | ~$7-15 |
| RDS Postgres (db.t4g.micro) | ~$12 |
| S3 (< 1GB typical) | ~$0.03 |
| Data transfer (light) | ~$1-2 |
| **Total** | **~$20-30/mo** |

## What Stays The Same

- All 15 API routers — zero changes to business logic
- All frontend code — React SPA, chart rendering, editor, embedding
- All 25 chart types — Observable Plot rendering
- All 9 themes + custom theme builder
- All export formats (PNG, PPTX, CSV, PDF, HTML)
- All data connectors (Snowflake, Postgres, BigQuery, Sheets)
- JWT auth system — just gets enabled by default in cloud mode

## Implementation Order

1. Storage abstraction layer (biggest code change)
2. Database Postgres compatibility
3. Production Docker image (multi-stage)
4. FastAPI static file serving for SPA
5. CloudFormation template
6. CLI deploy command
7. Test: deploy to Andrew's AWS account
8. Write user-facing deployment guide
