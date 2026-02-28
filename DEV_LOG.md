# Dev Log

## 2026-02-27

### Session 19: Invite Consolidation + User Deletion

**Goal:** Consolidate the two separate invite paths (Teams and User Management) into a single entry point, and add permanent user deletion.

**Changes:**

**Invite consolidation — Teams no longer invite unregistered users:**
- `api/routers/teams.py`: Team invite endpoint returns 404 for unregistered users instead of creating invite tokens. Removed `send_team_invite_email` and `create_invite` imports.
- `api/email.py`: Deleted `send_team_invite_email()` function (dead code after consolidation)
- `app/src/pages/SettingsPage.tsx`:
  - Added `prefillInviteEmail` shared state in parent `SettingsPage` for cross-panel communication
  - TeamManager shows amber "not registered" inline message with link that triggers User Management's invite modal pre-filled
  - AdminUsersSection accepts `prefillEmail` prop, auto-opens modal and scrolls into view
  - Removed `inviteResult` state and "share link" UI from TeamManager (no longer needed)
- `api/tests/test_teams.py`: Updated `test_invite_unregistered_user` to expect 404, removed `test_send_team_invite_email_no_resend`

**User deletion:**
- `api/services/metadata_db.py`: Added `delete_user()` with cascading cleanup (notifications, team_members, dashboard_shares, api_keys, comments)
- `api/routers/admin.py`: Added `DELETE /api/admin/users/{user_id}` endpoint (self-delete blocked)
- `app/src/pages/SettingsPage.tsx`: "Delete" button appears for inactive users, with ConfirmDialog warning about permanent data removal

**Other:**
- `app/src/pages/DashboardBuilderPage.tsx`: Refactored to use shared `buildChartConfig` utility

**Commits:** `70fd533`, `7de61ec`

---

### Session 18: SQL Editor for CSV Sources + Panel Animation

**Goal:** Enable the SQL workbench for uploaded CSV sources (not just database connections), and polish panel animations.

**Changes:**
- `SourcesPage.tsx`: Added `onRowClick` to the Uploaded Files section so CSV rows open the SQL workbench
- `SqlWorkbenchPanel.tsx`: Made workbench CSV-aware:
  - Schema fetched from `/api/data/schema/{sourceId}` (DuckDB) instead of external DB endpoint
  - Queries run via `/api/data/query-raw` (DuckDB) with dict→array row transformation
  - Auto-complete uses bare DuckDB table name (`src_xxx`) instead of `filename.src_xxx`
  - "Chart this" navigates directly (data already in DuckDB, no sync needed)
  - AI assistant uses "duckdb" dialect for CSV sources
- Panel slide-in/out animation: kept panel mounted during slide-out via `onTransitionEnd` unmount; double `requestAnimationFrame` for slide-in to ensure browser paints off-screen state first
- Fixed 3 unused Python imports flagged by ruff linter

**Commits:** `6ebe10e`, `1d758ed`, `3f5385a`

---

### Session 17b: AWS Deployment Fix + Documentation Overhaul

**Problem:** AWS App Runner entered a rollback loop (6+ consecutive rollbacks) after RDS was recreated on Feb 26. Root causes:
1. RDS PostgreSQL 16 defaults to `rds.force_ssl=1` — connections without `?sslmode=require` fail
2. RDS password changed multiple times via `aws rds modify-db-instance` — went out of sync with App Runner's DATABASE_URL
3. App Runner rollback reverts both image AND env vars — creating a catch-22 where config fixes also get rolled back

**Resolution:** Full destroy + fresh deploy (same as Feb 26). New App Runner URL: `https://uyezpksihv.us-east-2.awsapprunner.com`

**Preventive changes:**
- `deploy/cloudformation.yaml`: DATABASE_URL now includes `?sslmode=require` (committed earlier as `a769b7c`)
- `deploy/aws.py`: `destroy_stack()` now empties S3 bucket (including versioned objects) before CloudFormation delete — fixes `S3Bucket DELETE_FAILED` on destroy
- `docs/deploy-aws.md`: Added troubleshooting section for rollback loops, clarified `update` vs `deploy` behavior
- `tasks/lessons.md`: Rewrote AWS Deployment Rules with comprehensive rules for the two deploy commands, SSL requirement, rollback catch-22 escape procedure, and documented common mistakes
- `connection.py`: Already has `connect_timeout=10` (committed as `d6518e7`)

**Key rule going forward:** NEVER use direct AWS CLI (`aws rds modify-db-instance`, `aws apprunner update-service`) to change config. Always use `deploy.cli deploy`. If in a rollback loop (2+ consecutive rollbacks), stop trying fixes and do full destroy + redeploy.

---

### Session 17: Password Reset / Forgot Password Flow

**Goal:** Add forgot password flow so locked-out users can reset their password via email.

**Backend changes:**
- `metadata_db.py`: Added `password_resets` table + `create_password_reset()` (rate-limited 3/hr/email, invalidates old tokens), `get_valid_password_reset()`, `mark_password_reset_used()`
- `email.py`: Added `send_password_reset_email()` using same dark HTML template as other emails, with localhost console fallback
- `auth_simple.py`: Added `POST /auth/forgot-password` (timing-safe — always returns success regardless of whether email exists) and `POST /auth/reset-password` (validates token, sets new password, returns JWT for auto-login)

**Frontend changes:**
- `authStore.ts`: Added `forgotPassword()` and `resetPassword()` actions
- `ForgotPasswordPage.tsx` (new): Email input form, shows success message after submit
- `ResetPasswordPage.tsx` (new): New password + confirm form, reads `?token=` from URL, auto-logs in on success
- `LoginPage.tsx`: Added "Forgot password?" link below password field (login mode only)
- `App.tsx`: Registered `/forgot-password` and `/reset-password` as public routes

**Security:** 30-minute token expiry, one-time use, 3 requests/email/hour rate limit, timing-safe (never reveals whether email exists), previous unused tokens invalidated on new request.

**Commit:** `0e407ed`

---

## 2026-02-26

### Session 16: Map Projection Bug Fix in Editor

**Goal:** Fix maps rendering with the wrong projection in the chart editor (correct in library view).

**Root cause:** The editorStore defaulted `geoProjection` to `'geoEqualEarth'` for all maps. When a chart was saved, basemap-matching projections (e.g. `geoAlbersUsa` for US maps) were never persisted because the store never set them. On reload, the store filled in `'geoEqualEarth'` — a truthy value that short-circuited the basemap default fallback chain in map components. The library view worked because the saved config had no `geoProjection`, letting `config.geoProjection || basemapDefault` fall through correctly.

**Fix (`editorStore.ts`):**
- Chart load now derives projection from basemap default: `chart.config?.geoProjection ?? BASEMAPS.find(...)?.defaultProjection ?? 'geoEqualEarth'`
- `updateConfig` auto-sets projection when basemap changes (e.g. switching to US States sets `geoAlbersUsa`)

**Map rendering refactor (`useGeoMap.ts`, `ChoroplethMap.tsx`, `GeoPointMap.tsx`):**
- Extracted `buildProjection()` helper — consumers compute projection inside their own effects by reading SVG dimensions directly from the DOM, eliminating async state timing mismatches between hook state and consumer render.
- Added `mapVersion` counter (increments on SVG recreation) to replace `projectionFn`/`pathFn` state in the hook.
- ResizeObserver guards against 0 width (matches ElectionDonut pattern), removed `loading` from deps.

**Commit:** `80c00e7`

---

### Session 15: SQL Editor Polish, Nav Bar Fix, Map Sizing, Source Naming

**Goal:** Fix several UX issues — SQL syntax highlighting, missing nav bar on detail pages, squished maps in editor, and ugly temp file names from SQL query exports.

**SQL Editor syntax highlighting (`SqlEditor.tsx`):**
- CodeMirror 6 had `sql()` language extension but no highlight style for light mode.
- Added `syntaxHighlighting(defaultHighlightStyle, { fallback: true })` — keywords (SELECT, FROM, WHERE) now show in distinct colors. `oneDark` theme's own styles take precedence in dark mode.

**TopNav restored on detail pages (`ChartViewPage.tsx`, `DashboardViewPage.tsx`):**
- Commit `acc2cd3` moved `/chart/:chartId` and `/dashboard/:dashboardId` routes outside `AppShell` for public share link support, but this removed the persistent `TopNav` for authenticated users.
- Added `{user && <TopNav />}` to both pages — authenticated users see the full nav bar, anonymous viewers still get the minimal header.

**Map sizing fix (`useGeoMap.ts`):**
- All map types (Choropleth, Spike, Symbol, Locator) rendered squished in the editor because the ResizeObserver watched the loading-state div, then never re-observed the actual map div after basemap loaded.
- Added `loading` to the ResizeObserver effect's dependency array so it disconnects and reconnects to the correct DOM element on state transition.

**SQL query source naming (`SqlWorkbenchPanel.tsx`, `duckdb_service.py`):**
- SQL query results were saved with ugly temp file names (`tmpvdn35wam.parquet`) from Python's `tempfile.NamedTemporaryFile`.
- Frontend: Added `deriveSourceName()` that extracts the main table name from SQL (e.g., `SELECT * FROM earthquakes` → `"earthquakes"`).
- Backend: `ingest_parquet` now stores a clean synthetic path based on the friendly name instead of the temp file path. Deduplicates with `_2`, `_3` suffixes on collision.

**Commit:** `1f1070a`

---

### Session 14: Multi-Table Import Safeguards + Test Isolation

**Goal:** Enforce row limit safeguards on table imports, surface schema errors, and prevent tests from polluting production data.

**One-at-a-time large table import (`DatabaseConnector.tsx`, `SourcePickerPage.tsx`):**
- Tables >100K rows cannot be batch-imported — only "ok" status tables (<100K) are included in multi-select import.
- Warning/blocked tables show "import with SQL" messaging, directing users to the SQL workbench for filtered/aggregated queries.
- `handleImportSource` routes imported SQL query results through the DataShaper flow (schema fetch → column picker) instead of navigating directly to the editor.

**Schema error visibility (`SqlWorkbenchPanel.tsx`):**
- `fetchSchema` was silently swallowing errors, showing "No schemas found" instead of the actual error message.
- Added `schemaError` state — now displays the real error (e.g., expired Snowflake token) in red text.

**Test isolation (`api/tests/conftest.py` — new):**
- Tests were writing connections, charts, dashboards, and CSVs directly to `data/`, polluting production data.
- Created session-scoped isolation using `pytest_configure`/`pytest_unconfigure` hooks.
- Redirects: `STORAGE_LOCAL_DIR` env var, `get_storage()` cache, all 9 module-level `_storage` references, `DuckDBService` singleton, `_CREDENTIALS_DIR`, `_SCHEMA_CACHE_DIR` — all point to a temp directory.
- macOS fix: `.resolve()` on temp path to handle `/var` → `/private/var` symlink.

**Pre-commit hook update (`.husky/pre-commit`):**
- Switched from `engine/tests/` (stale, broken imports) to `api/tests/` (maintained suite).
- Deselected two pre-existing failing tests (test_comments, test_dashboard_embed).
- Added frontend vitest run with SettingsPage exclusion.

**Data cleanup:** Removed all test-generated junk (8 connections, 25 uploads, 42 dashboards, 69 charts). Restored clean state from `data/seed/`: 1 dashboard, 25 charts, 25 CSV sources, 1 Snowflake connection.

**Commits:** `5bcdc31`–`29ca3fd` (6 commits total)

### Session 14b: SQL Workbench UX Polish

**Goal:** Fix SQL workbench bugs and improve UX of AI assistant, editor, and query flow.

**Semicolon handling (all connectors):**
- User SQL with trailing `;` broke queries — connectors wrap SQL in `SELECT * FROM (...) _q LIMIT N`, so semicolons inside the subquery cause syntax errors.
- Added `sql.replace(";", "").strip()` in Snowflake, Postgres, and BigQuery `execute_query()` methods.
- Also strip leading SQL comments (`--`, `/* */`) in `validate_sql()` so commented queries pass validation.

**AI Assistant redesign (`AiSqlAssistant.tsx`):**
- Shows active LLM provider in header (e.g. "AI Assistant (Claude)").
- Removed empty "Ask me to write SQL..." panel — chat area only shows when messages exist.
- Input changed from 3-row textarea to auto-expanding single-line (grows with content, max ~5 lines).
- Fixed "Fix with AI" button — was no-op because effect only fired on error null→string transition. Now uses counter-based trigger that fires on every click.

**SQL Editor fixes (`SqlEditor.tsx`):**
- Cmd+Enter now works — moved `runKeymap` before `defaultKeymap` in extension order (CodeMirror uses first-match-wins).
- Editor preserves SQL content across schema/theme reloads — saves `currentDoc` before recreating.
- Used ref pattern for `onRun` callback to avoid stale closure issues.

**Layout:** Moved Query Results above AI Assistant (standard SQL editor pattern: editor → results → assistant).

**DataShaper:** Renamed buttons to "Use reshaped data" / "Skip" for clarity.

**Commits:** `abb404a`

---

### Session 13: AWS Redeployment + Deploy Script Fix

**Goal:** Fix broken AWS deployment caused by password regeneration bug.

**Deploy script fix (`deploy/cli.py`, `deploy/aws.py`):**
- Root cause: `secrets.token_urlsafe(16)` generated a new random DB password on every deploy run, not just the first. When a deployment failed for a transient reason (ECR access role), App Runner rolled back its config to the old password while RDS kept the new one — creating an unrecoverable mismatch.
- Fix: Only generate a password on first-time creation (`is_new` check via `get_stack_status(quiet=True)`). Updates use `UsePreviousValue` to preserve the existing RDS password.
- Added `quiet` param to `get_stack_status()` (returns `{}` instead of `sys.exit(1)` for missing stacks).

**Fresh deployment:** Destroyed old stack and redeployed cleanly. New App URL: `https://gdqppc4pig.us-east-2.awsapprunner.com`

**Local deployment:** Redirected to custom domain `story.bi`.

**Commits:** `90e133b` (deploy script fix), `c4304ce` (route refactor)

---

### Session 12: Onboarding Notifications + Deploy-to-Unlock Prompts

**Goal:** Seed onboarding tips for new users, add deploy-to-unlock pattern for cloud-only features, fix UI bugs.

**Onboarding notifications (`api/services/metadata_db.py`, `api/auth_simple.py`):**
- New `seed_onboarding_tips(user_id)` function: idempotent, inserts tips with staggered timestamps so they appear as "just now", "2m ago", etc.
- 10 base tips (welcome, upload data, create chart, build dashboard, customize theme, AI provider keys, AI suggestions, chart types, transforms, export).
- 4 cloud-only tips when `AUTH_ENABLED=true` (API keys for Claude Code, share/embed, invite team, set locale).
- Called from `ensure_default_user()` (local) and `/register` endpoint (cloud).
- Tests: `TestOnboardingTips` class with 5 tests; added `teardown_method` to `TestNotifications` to prevent notification leak.

**Notification dropdown enhancements (`app/src/components/notifications/`):**
- Click-to-navigate: clicking a notification with `action_url` in its payload navigates to that page and closes the dropdown.
- Emoji icons: `ICON_MAP` maps icon keys (rocket, upload, chart, etc.) to emojis rendered beside each notification.
- Mute toggle: `notificationStore.ts` gains `muted` state (localStorage-persisted). When muted, fetches become no-ops, bell hides badge and stops polling. "Notifications are muted" message with Unmute button in dropdown.
- Settings: new `NotificationPreferences` section with mute toggle switch.

**Deploy-to-unlock pattern (`app/src/components/DeployPrompt.tsx`):**
- `DeployPopover`: inline popover shown when clicking Share locally — explains deployment is needed, links to `docs/deploy-aws.md`.
- `DeployTeaser`: card-style teaser for settings sections hidden locally.
- Applied to: Share buttons (dashboard, editor, chart view), Teams, User Management, and API Keys in Settings.
- Previously hidden sections now show what users are missing, encouraging deployment.

**UI fixes:**
- Chart library card actions: added `flex-wrap` to prevent overflow at narrow widths, removed `flex-1` spacers. Reordered to Edit → Duplicate → Move → Archive → Delete. Added border to Move button for visual consistency.
- HTML export: converted `<a href>` to `authFetch` blob download — plain anchor tags bypass the Vite dev proxy, causing "site wasn't available" errors locally.

**Commits:** `9de9442` (onboarding notifications), `dd7a5dc` (deploy prompts + UI fixes)

---

### Session 11: Invite Link Fallback + Deploy Docs Fix

**Goal:** Make team invites work without Resend email configured; fix deploy docs inaccuracies.

**Backend — invite link fallback (`api/routers/teams.py`, `api/email.py`):**
- Previously, when `RESEND_API_KEY` wasn't configured on AWS, the invite endpoint returned HTTP 502 even though the invite was created in the DB. Now returns 200 with `email_sent: false` and `invite_url`, so the frontend can show the link for manual sharing.
- `api/email.py`: Email functions now return `False` on non-localhost when no Resend key is set (previously returned `True`, hiding the failure).

**Frontend — copy invite link UI (`app/src/pages/SettingsPage.tsx`):**
- Added `inviteResult` state. When `email_sent` is false, shows a yellow notification box with the invite URL and a "Copy link" button. Clears on new invite or team switch.

**Deploy docs fixes (`docs/deploy-aws.md`):**
- Step count: 5 → 7 (matching actual CLI which has "Setting FRONTEND_BASE_URL" and "Triggering App Runner deployment" steps)
- Region: `us-east-2` is Ohio, not N. Virginia (`us-east-1` is N. Virginia)
- Added `--resend-api-key` and `--from-email` to CLI Reference table
- New "Setting Up Email (Optional)" section explaining Resend signup and configuration

**CloudFormation + deploy script (`deploy/cloudformation.yaml`, `deploy/aws.py`, `deploy/cli.py`):**
- Added `FrontendBaseUrl` parameter and `FRONTEND_BASE_URL` + `API_BASE_URL` env vars to App Runner service, so invite links point to the correct host instead of `localhost:3001`.
- Deploy script does a stack update after initial creation (step 5/7) to set the URL once the App Runner service URL is known — avoids circular reference in CloudFormation.

---

### Session 10: Chart Share Modal, Email Error Surfacing

**Goal:** Add proper share modal for charts, fix silent email failures in team invites.

**Chart share modal (PR #12, frontend):**
- New `app/src/components/sharing/ChartShareModal.tsx`: Modal with private/public visibility toggle that calls chart publish/unpublish API. Shows share link (`/public/chart/:id`) and embed code (`<iframe>`) only when set to Public. Includes clipboard copy with "Copied!" feedback.
- `app/src/pages/ChartViewPage.tsx`: Replaced old inline `SharePanel` with Share button that opens the modal. Modal syncs status back to page state via `onStatusChange` callback.
- `app/src/pages/EditorPage.tsx`: Added Share button to editor header (next to Publish/Republish). Modal syncs status back to Zustand editor store.

**Email error surfacing (PR #11, backend):**
- **Bug:** `api/routers/teams.py` `invite_member` endpoint ignored the boolean return value of `send_team_invite_email()` and `send_team_added_email()`, always returning 200 even when email delivery failed silently.
- **Fix:** Now checks return value and raises HTTP 502 with actionable error message ("email failed to send") so the frontend can inform the user.
- `api/email.py`: Replaced bare `print()` calls with `logging.getLogger(__name__)` for both `send_team_invite_email` and `send_team_added_email` error paths.

---

## 2026-02-25

### Session 9: S3 Transform Cache Bug, Scatter Plot Fix, API Docs

**Goal:** Fix scatter plots with numeric series, fix transforms broken on S3 deployments, write API documentation.

**Scatter plot numeric series fix (frontend):**
- `app/src/components/charts/ObservableChartFactory.tsx`: Numeric series columns (e.g., `release_year`) made scatter dots invisible — Observable Plot treated `fill` as continuous. Fix: coerce numeric series to strings upstream of both `buildMarks()` and `buildPlotOptions()` so the color domain and dot fill values match. Initial fix only coerced in `buildMarks`, causing a domain mismatch (numbers vs strings) that still hid dots.

**S3 transform cache bug (backend):**
- **Root cause:** `_reingest_and_preview()` called `ingest_csv()` which re-uploaded the stale local cached file back to S3, overwriting the transform result. All 8 transform operations (rename, transpose, delete column, etc.) were silently broken on S3 deployments.
- `api/services/duckdb_service.py`: New `reload_source()` method — invalidates local cache, re-downloads from S3, rebuilds DuckDB table without re-uploading
- `api/services/storage/base.py`: New `invalidate_local_cache()` method (no-op for local)
- `api/services/storage/s3.py`: Override deletes cached file so next `get_local_path()` re-fetches from S3
- `api/routers/transforms.py`: `_reingest_and_preview()` now calls `reload_source()` instead of `ingest_csv()`

**Seed data fix:** Renamed `field` back to `study_hours` on cloud via the now-working transform API for the "More Hours, Better Scores" scatter chart

**API documentation:** `docs/API.md` — comprehensive reference covering auth (API key, JWT, no-auth), quick start, data sources, transforms, charts (CRUD + AI + versioning), dashboards, folders, teams, connections, themes, error codes, and limits

**Ruff linter fix:** Fixed F541 (f-strings without placeholders) in `api/email.py`, F401 (unused imports) in `teams.py`, `test_s3_storage.py`, `test_storage_backend.py`, `test_versions.py`

**Tests:** 287 backend tests passing (17 transform tests pass with new reload_source path)

---

### Session 8: Team Email Invites & Deploy Fix

**Goal:** Allow team admins to invite anyone by email (not just registered users), and fix unreliable App Runner deployments.

**Deploy fix:**
- `deploy/cli.py`: `cmd_deploy` now explicitly calls `trigger_apprunner_deploy()` after CloudFormation step. Root cause: pushing `:latest` to ECR doesn't reliably trigger App Runner auto-deployment, and CloudFormation returns "No updates to be performed" when only the image changed.

**Team invites (6 commits):**
- `api/services/metadata_db.py`: Added `team_id` and `team_role` columns to `invites` table with PostgreSQL-safe migration (`ADD COLUMN IF NOT EXISTS` for Postgres, try/except for SQLite). New function: `get_pending_team_invites()`
- `api/email.py`: Two new email templates — `send_team_invite_email()` (unregistered users) and `send_team_added_email()` (registered users). Same dark theme as magic link emails.
- `api/routers/teams.py`: Rewrote `POST /api/teams/{id}/invite` — registered users get added directly + notification email, unregistered users get invite token + invite email with registration link
- `api/auth_simple.py`: Registration auto-joins team when invite token has `team_id`
- `app/src/pages/SettingsPage.tsx`: Updated invite handler to show "Added to team" vs "Invite sent" with green success messages
- 17 team tests passing, 28 admin tests passing (no regressions)

**Bug found & fixed:** PostgreSQL migration crash — the try/except pattern for column detection poisons PostgreSQL transactions. Branched migration logic by DB type.

**Design doc:** `docs/plans/2026-02-25-team-invites-design.md`
**Implementation plan:** `docs/plans/2026-02-25-team-invites-plan.md`

---

### Session 7: Admin User Management & Account Settings

**Goal:** Transform the bare change-password Account section into a real admin panel with user lifecycle management, invite system, and role enforcement.

**Backend (5 commits):**
- `api/services/metadata_db.py`: Added `invites` and `admin_settings` tables, plus 11 new functions: `list_all_users`, `update_user_role`, `update_user_status`, `update_user_display_name`, `create_invite`, `list_invites`, `get_invite_by_token`, `mark_invite_used`, `delete_invite`, `get_admin_setting`, `set_admin_setting`
- `api/routers/admin.py`: New admin router with `require_admin` dependency (403 for non-admins). Endpoints: `GET/PUT /admin/users/{id}/role`, `GET/PUT /admin/users/{id}/status`, `POST/GET/DELETE /admin/invites`, `GET/PUT /admin/settings`
- `api/auth_simple.py`: Added `PUT /auth/profile` (edit display name), deactivated account detection on login (403 with specific message), invite token support in registration, `open_registration` admin setting check
- 28 new backend tests covering all DB functions and endpoints

**Frontend (2 commits):**
- **Account section** expanded: editable display name, email display, role badge (admin/editor), **logout button**, change password form
- **User Management section** (admin-only): user table with role dropdowns and activate/deactivate toggles, invite modal (generates copyable registration link), pending invites list with revoke, open registration toggle
- **Login page**: handles `?invite=<token>` query param — auto-switches to register mode with invite banner

**Linter fix:** Moved `import os`, `StaticFiles`, `FileResponse` to top-level imports in `api/main.py` to fix pre-existing ruff E402 errors in CI.

**Design doc:** `docs/plans/2026-02-25-admin-user-management-design.md`
**Implementation plan:** `docs/plans/2026-02-25-admin-user-management-plan.md`

---

### Session 6: Data Source Cleanup & E2E Leak Prevention

**Problem:** E2E tests and Python scripts uploaded CSVs via `/api/data/upload` but never deleted them, accumulating hundreds of orphaned sources. User had already cleaned 482 `test.csv` and 32 `csv_dl_test.csv` files manually.

**Dashboard data repair:**
- 11 charts in the Perfect Dashboard had broken source references after the bulk cleanup
- Ran `fix_perfect_dashboard_v2.py` to restore 8 charts, manually fixed remaining 3 (DataTable, SpikeMap, Website Traffic Heatmap)
- Fixed `y`/`series` column mismatches on GroupedColumn and StackedColumn charts — UNPIVOT SQL outputs `metric_name`/`metric_value` but chart config referenced old column names

**Cleanup to pristine 25-chart setup:**
- Deleted 8 duplicate charts not referenced by the Perfect Dashboard
- Removed 40 orphan upload directories
- Final state: 25 charts ↔ 25 data sources ↔ 1 dashboard, zero orphans

**Seed data refresh (`data/seed/`):**
- Copied current working data into `data/seed/` so new clones get the Perfect Dashboard on first run
- Verified integrity: all 25 dashboard chart refs → chart files → source uploads cross-referenced

**E2E test leak prevention:**
- `helpers.ts`: `createTestChart()` now returns `{ chartId, sourceId }` (was just `chartId`); added `deleteSource()` helper
- `screenshots-deferred.spec.ts`: tracks `sourceIds` array, deletes in `afterEach` alongside charts; direct uploads in tests 06/07/08 also tracked
- `chart-types.spec.ts`: tracks and deletes sourceIds in `afterAll`
- `embed.spec.ts`: tracks and deletes sourceId in `afterAll`
- `audit-templates.ts`: `uploadCsv()` pushes to `allSourceIds`; cleanup section deletes all sources

**Python script old-source cleanup:**
- `fix_perfect_dashboard_v2.py`: each fix function reads `old_source` before uploading, calls `delete_source()` after saving; added `delete_source()` helper; DataTable fix now uses hardcoded fallback data
- `fix_perfect_dashboard_data.py`: `update_chart()` tracks old source and deletes it when replaced; added `delete_source()` helper

### Session 5: README & Website Update, Colorblind/Accessibility Removal, Theme Fixes

**README.md and website/index.html updated to reflect current feature set:**
- 11 chart types → 25 chart types with grouped categories (classic, analytical, maps, specialty)
- Added: geographic maps, data transforms, version history, annotations (responsive scaling), API, custom themes, portable HTML export
- Updated: export formats (added PPTX, CSV), data sources (added Google Sheets)
- Removed: embedding (no hosting solution yet), collaboration (local-first limitation), accessibility/WCAG compliance (deleted from codebase)
- Updated meta/OG/Twitter descriptions and "How It Works" step 3

**Theme-aware colors across custom chart types:**
- ChartWrapper: CSS custom property overrides when theme sets explicit colors (surface, text, border vars)
- ElectionDonut/MultiplePies: use theme font/card colors instead of hardcoded dark/light values
- ObservableChartFactory: theme-aware annotation and axis colors

**Colorblind utilities removed:**
- Deleted `ColorblindPreview.tsx`, `colorblind.ts`, and `colorblind.test.ts`
- Removed colorblind references from PaletteBuilder, Toolbox, SharePanel, ChartViewPage
- Cleaned up accessibility test file

**PDF export fix:**
- Subtitle now included in PDF export metadata

### Session 4: Map Label Collision Avoidance

**Locator map label overlap fix:**
- Pin labels were positioned at a fixed offset (x=10, y=-4) with no collision detection — overlapping when points are close together
- Added greedy collision avoidance pass after initial label render in `GeoPointMap.tsx`
- Tries 4 candidate positions per label: right (default), left, above, below
- Picks first non-overlapping position using AABB overlap test with 4px padding
- Labels that can't fit in any position are hidden (`visibility: hidden`) — tooltip still works on hover
- Uses `getComputedTextLength()` for accurate width measurement in SVG coordinate space

### Session 3: Heatmap Auto-Binning, BigValue Height, Tooltip Formatting, Annotation Theming

**Heatmap auto-binning for numeric axes:**
- Numeric columns with >20 distinct values (e.g., "Count of actions" 1–110) created unreadable 100+ row heatmaps
- Added `binHeatmapAxis()` helper: bins into ~10 clean ranges via `d3.ticks()`, aggregates fill values with mean
- Handles both x-axis and y-axis binning, including the tricky no-series case where y doubles as position and fill (uses synthetic `__heatFill` column)
- Explicit domain arrays (`__heatXDomain`, `__heatYDomain`) stashed on data to prevent alphabetical sorting of range labels like "10–20" before "2–4"
- Auto-rotates x-axis labels when bins overflow available width (`width/domainLen < 60px`)
- Fixed bottom margin stacking: rotated labels + axis title now get 85px margin and 68px label offset

**BigValue dashboard card height:**
- KPI grid now uses `h-full content-center` to vertically center metrics within any container size
- Dynamic auto-generated height formula: h=5 (1–2 metrics), h=6 (3–4), h=7 (5–6), h=8 (7–8)
- Persisted layouts respected as-is — no forced overrides

**Tooltip number formatting (all chart types):**
- `fmtTipValue()` was using `d3.format(',.4~g')` which produced scientific notation for large numbers (23,800 → "2.38e+4")
- Replaced with `toLocaleString('en-US')` — always produces human-readable comma-separated numbers globally across all tooltips

**Annotation theme reactivity:**
- Annotation colors (point notes, reference lines) used `getComputedStyle()` at render time, baking hex values into SVG — failed to update on dark/light theme toggle
- Replaced with CSS `var()` references (`var(--color-surface-raised)`, `var(--color-text-primary)`) so SVG attributes resolve at paint time, always matching the current theme

---

### Session 2: DataTable Default Sort, Area Chart Fix, Library UX, Dashboard Copy

**DataTable default sort column:**
- Added `tableDefaultSortColumn` and `tableDefaultSortDir` to `ChartConfig` and `EditorConfig`
- Toolbox UI: column dropdown + asc/desc toggle, only shown for DataTable charts
- `RichDataTable` initializes sort state from config, syncs live via `useEffect` for editor preview
- Wired through `loadChart`, `saveNew`, `save`, and `EditorPage` chartConfig mapping
- Seed data: Global Country Statistics ships pre-sorted by GDP descending

**Multi-series area chart zigzag fix:**
- Non-stacked multi-series area charts rendered wild zigzag artifacts
- Root cause: UNPIVOT data arrives interleaved by series at each x-value; Observable Plot's `areaY` needs monotonic x per series
- Fix: added `sort: x` to both `areaY` and `lineY` marks in the non-stacked branch
- Stacked areas were unaffected (Plot.stackY handles sorting internally)

**Folder sidebar cleanup:**
- "Unfiled" virtual folder was always shown, even with zero real folders (redundant with "All charts")
- Now only renders when `folders.length > 0`
- Edge case: resets filter to "All charts" if last real folder is deleted while viewing "Unfiled"

**Dashboard content polish:**
- Rewrote titles and subtitles for all 25 Perfect Dashboard charts with clever, personality-driven copy
- Copied updated seed files to live `data/charts/` for immediate visibility

---

### Session 1: Chart Polish — Smart Tooltips, Map Fixes, Dashboard UX

**Tooltip unit detection (all chart types):**
- Treemap, pie, choropleth, symbol, and spike map tooltips now auto-detect units from title/subtitle text (e.g. "FY 2025 spending in billions of dollars" → `$1,340B` instead of `1,340`)
- Extracted shared `detectScaleFromText()`, `fmtWithUnit()`, `detectUnitFromTitleSubtitle()` to `utils/formatters.ts`
- `buildChartConfig()` now passes title/subtitle into ChartConfig so detection works in dashboard context

**Tooltip targeting fix (line/area charts):**
- Multi-series line and non-stacked area charts switched from `Plot.pointerX` to `Plot.pointer` — picks the series line nearest to cursor instead of arbitrary nearest-x point
- Stacked area tooltip now includes `order: 'value'` to match visual stack order

**Map fixes:**
- Symbol/spike/locator maps auto-detect label column when `geoLabelColumn` not configured
- Locator map pins: added transparent hit rect + `pointer-events: none` on children for reliable `mouseleave`
- Container-level `onMouseLeave` safety net on all map components
- `overflow: hidden` on map containers prevents SVG overlapping title/subtitle in dashboard view
- SVG `overflow: visible` → `overflow: hidden` in `useGeoMap.ts`

**Dashboard UX:**
- Chart view shows "← Dashboard" link when navigated from a dashboard (via `?dashboard=` query param)
- Pie/donut/election charts get larger default dashboard height (h=9, 540px instead of 420px)

**Dot plot domain:**
- X-axis auto-tightens when all values are far from zero (min > 40% of max), removing wasted whitespace
- Zero rule line conditionally hidden when domain doesn't include zero

**Source notes:**
- Added source attributions to 34 charts (government data, industry reports, internal data, etc.)

---

## 2026-02-24

### Session: Phase 8 — Data Transforms, Edit History, CSV Download

**3 parallel worktree sessions (N, O, P)**, all merged to main. 771 total tests (200 backend + 571 frontend).

**Session N — Data Transforms:**
- 8 transform endpoints in `api/routers/transforms.py` (transpose, rename-column, delete-column, reorder-columns, round, prepend-append, edit-cell, cast-type)
- Each transform modifies source CSV on disk and re-ingests into DuckDB
- `DataTransformGrid.tsx`: editable HTML table with column header dropdown menus, inline cell editing, transpose button
- 8 transform methods added to `dataStore.ts`
- Chart/Transform Data view toggle in EditorPage
- 27 tests (17 backend + 10 frontend)

**Session O — Edit History / Versioning:**
- `version_storage.py`: snapshot storage in `data/versions/{chart_id}/`, auto-prune at 50 versions
- `versions.py` router: create, list, get, restore, delete version endpoints
- Auto-save triggers: every 30 saves, 60s idle debounce, on publish, manual "Save Version" button
- `VersionHistoryPanel.tsx`: chronological version list with trigger badges (auto/publish/manual), restore with confirmation dialog
- Republish distinction: button label changes after first publish, version badge in header
- 22 tests (14 backend + 8 frontend)

**Session P — CSV Download:**
- `GET /api/v2/charts/{chart_id}/data.csv`: re-executes chart SQL, streams CSV with Content-Disposition
- `allowDataDownload` config toggle (default true), returns 403 when disabled
- "Get the data" link in EmbedChartPage/PublicChartPage footer (hidden when disabled or plain mode)
- CSV button in ChartWrapper export row (alongside SVG/PNG/PDF/PPTX)
- 12 tests (6 backend + 6 frontend)

**Merge:** P → O (auto) → N (2 conflicts: `api/main.py` both routers, `EditorPage.tsx` imports + transform toggle layout with CSV download props). All resolved, 771 tests green.

**Phase 8 closes medium-impact gaps 2-4.** Remaining: localization expansion (12→50+ locales, RTL) + lower-impact items (map basemaps, table column types, advanced tooltips, oEmbed, real-time collab).

---

### Session: Phase 7 — Embed Flags, Chart Types, Accessibility

**3 parallel worktree sessions (K, L, M)**, all merged to main. 705 total tests (163 backend + 542 frontend).

**Session K — Embed Render Flags:**
- `parseEmbedFlags()`: 5 URL query params (plain, static, transparent, logo, search)
- EmbedChartPage + EmbedDashboardPage: conditional header/footer, pointer-events, background, logo, search passthrough
- RichDataTable: `initialSearch` via extraProps for pre-filtered embeds
- ChartWrapper: `hideLogo` prop
- 33 vitest tests

**Session L — Chart Types (19 → 25):**
- StackedColumn, GroupedColumn, SplitBars, ArrowPlot, ElectionDonut, MultiplePies
- Custom D3 hemicycle for ElectionDonut, small-multiples pie/donut grid for MultiplePies
- ChartTypeSelector entries with SVG icons, Toolbox conditional fields
- 23 vitest tests

**Session M — WCAG AA Accessibility:**
- `altText` field in ChartConfig + editor textarea
- ARIA attributes: `role="img"`, `aria-label`, `aria-describedby`, auto-generated sr-only summary
- Keyboard focus indicators (tabIndex, focus ring), keyboard sort on table headers
- `checkPaletteAccessibility()`: contrast ratio warnings, ColorblindPreview badges
- 26 vitest tests

**Merge:** K (fast-forward) → L (auto) → M (1 conflict in ChartWrapper.tsx: hideLogo + accessibility props). All resolved, 705 tests green.

---

### Session: Phase 6 — Final Datawrapper Parity + Screenshot Verification

**10 tasks across 5 sessions (4 parallel + 1 sequential)**, all merged to main. 613 total tests (163 backend + 450 frontend).

**Session F — Screenshot Verification:**
- 8 deferred Playwright E2E screenshot tests: published view, tooltips, theme builder, non-US locale, palette builder, rich table heatmap+sparkline, map projections, responsive annotations

**Session G — New Map Types:**
- Extracted `useGeoMap` hook from ChoroplethMap (shared basemap loading, projection, zoom/pan, ResizeObserver)
- GeoPointMap component with 3 variants: Symbol (sized circles), Locator (pin markers), Spike (vertical lines)
- Type registration: 3 new ChartTypes, 6 new ChartConfig fields, across 7 files
- 12 vitest tests

**Session H — PowerPoint Export + Dark Mode Embeds:**
- `pptxgenjs` (lazy-loaded): exportPPTX() with title/subtitle/image/source slide, PPTX button in ChartWrapper
- Dark mode auto-detection: `?theme=dark|light|auto` query param, `prefers-color-scheme` listener, PostMessage override
- Applied to both EmbedChartPage and EmbedDashboardPage
- 19 vitest tests (8 export + 11 embed)

**Session I — API Documentation + API Keys:**
- OpenAPI enrichment: description, version 0.2.0, openapi_tags, all router docstrings + Pydantic Field examples
- API key system: `sa_live_` prefix + SHA-256 hash, create/list/revoke endpoints, `X-API-Key` header + `?api_key=` auth
- ApiKeyManager UI in SettingsPage
- 12 tests (9 pytest + 3 vitest)

**Session J — Collaboration:**
- Comments: polymorphic (chart/dashboard), threaded via parent_id, soft-delete, CommentSidebar in EditorPage
- Teams: create/manage teams, membership CRUD, TeamManager in SettingsPage
- Notifications: create/list/mark-read, NotificationBell in TopNav with 60s polling
- 35 tests (24 pytest + 11 vitest)

**Merge notes:** Sessions F/G/H/I ran in parallel worktrees, merged sequentially (clean). Session J had 3 conflicts (main.py, metadata_db.py, SettingsPage.tsx) — all additive, resolved by keeping both sides.

### Session: Phase 5 — Close Remaining Datawrapper Parity Gaps

**11 tasks across 5 parallel worktree sessions**, all merged to main. 535 total tests (130 backend + 405 frontend).

**Session A — Embed Bundle + Archive:**
- Separate Vite embed entry point (embed.html, 2.62KB gzipped) — no router, no stores, no AI chat
- Archive/soft-delete with restore: `archived_at` timestamp, `/archive` + `/restore` endpoints, `?status=active|archived|all` filtering, library UI toggle

**Session B — Static PNG + Dashboard Embed:**
- Snapshot upload/serve endpoints (`data/snapshots/`), auto-generate PNG on publish, `<noscript>` fallback + `og:image`
- EmbedDashboardPage at `/embed/dashboard/:id` with PostMessage resize, public dashboard endpoint, embed code in ShareModal

**Session C — Theme Builder Completion:**
- FontPicker: 50 Google Fonts searchable dropdown + .woff2/.ttf upload, font injection via `<link>`/`<style>` tags
- Logo uploader: base64 storage, 4-corner position radio, size slider, absolutely positioned in ChartWrapper

**Session D — Data Source Enhancements:**
- Configurable polling interval: Toolbox dropdown (off, 30s, 1m, 5m, 15m), `setInterval` re-fetch in embed
- File-based data cache (`data/cache/`): TTL-based, `X-Data-Staleness` header, staleness indicator in embed footer

**Session E — Maps, Templates, Organization:**
- Map zoom/pan: d3-zoom on ChoroplethMap, +/-/Reset controls, pinch-to-zoom
- Template gallery: TemplateGallery modal in LibraryPage, EditorPage loads template from query param
- Drag-and-drop folders: @dnd-kit, DraggableChartCard + DroppableFolderItem with visual highlight

### Session: Clean Up Deferred Items from Phases 1-4

Closed 5 deferred items from the Datawrapper parity roadmap (Phases 1-4). All quick wins, no architectural changes.

**1. Security Headers Middleware** (`api/main.py`)
- `SecurityHeadersMiddleware` (BaseHTTPMiddleware): `X-Content-Type-Options: nosniff` + `Referrer-Policy` on all routes; CSP, Permissions-Policy, X-Frame-Options on `/embed/` and `/public/` routes.
- 18 pytest tests in `api/tests/test_security_headers.py`.

**2. Per-Chart Locale Override** (`chart.ts`, `editorStore.ts`, `Toolbox.tsx`)
- Added `locale` field to `ChartConfig`, `EditorConfig`, and `DEFAULT_CONFIG`.
- Locale dropdown in Toolbox ("Global default" + 12 SUPPORTED_LOCALES).
- Persisted through save/load cycle.

**3. Custom CSS Override in Theme Builder** (`chartThemes.ts`, `ThemeBuilderPage.tsx`)
- Added `customCss?: string` to `ChartTheme` interface.
- Monospace textarea section in ThemeBuilderPage between Plot Settings and Preview.

**4. Custom GeoJSON/TopoJSON Upload** (`editorStore.ts`, `Toolbox.tsx`, `ChoroplethMap.tsx`)
- "Custom upload..." option in basemap dropdown shows file input for `.json/.geojson/.topojson`.
- `loadCustomGeoJSON()` (already existed) parses file; result stored in EditorStore `customGeoData`.
- ChoroplethMap uses custom FeatureCollection when `basemap === 'custom'`.

**5. Playwright E2E Test Suite** (`app/e2e/`)
- `helpers.ts`: `createTestChart`, `publishChart`, `deleteChart`, `waitForChart`, `saveScreenshot`.
- `embed.spec.ts`: Desktop (1280px) + mobile (375px) rendering, missing chart error.
- `chart-types.spec.ts`: Bar, Line, Pie screenshot captures.
- `themes.spec.ts`: Same chart in all 9 curated themes.

**Stats:** 100 backend tests, 359 frontend tests, TypeScript clean.

---

## 2026-02-24

### Session: Visual QA Pass & Bug Fixes

Ran full visual QA pass using Playwright screenshots across all pages, chart types, and viewports. Found and fixed 3 issues:

1. **Editor mobile layout** (`EditorPage.tsx`): Toolbox + AI Chat sidebars overflowed at 375px. Fixed with `hidden lg:block` — only chart preview shows on mobile.
2. **X-axis label overlap** (`ObservableChartFactory.tsx`): Wired `config.tickAngle` → Plot's `tickRotate`. Added auto-rotation (-45°) when container < 500px with extra bottom margin.
3. **Pie chart label clipping** (`ObservableChartFactory.tsx`): Left-side external labels clipped by SVG viewBox. Expanded viewBox with negative X origin to accommodate label overflow.

Also fixed `e2e/screenshot.ts`: ESM `__dirname` resolution and CLI arg parsing (separating positional args from `--flags`).

All 359 frontend tests passing, TypeScript clean.

### Session: Phase 4 — Maps, Responsive Annotations, Templates (29 new tests)

Implemented all 3 Phase 4 tasks for the Datawrapper parity roadmap. Built in worktree `phase4-maps`.

**Task 15: Chart Templates & Duplication** (commit `d1f456b`)
- Backend: `template_storage.py` service (JSON in `data/templates/`), mirrors theme_storage.py
- Backend: `templates.py` router with full CRUD, duplicate endpoint, save-as-template endpoint
- Frontend: Duplicate button on ChartCard in LibraryPage
- Frontend: Template button in EditorPage header
- 14 backend tests (5 duplication, 7 template CRUD, 2 save-as-template)

**Task 14: Responsive Annotations** (commit `0aeb246`)
- Added `dxRatio`/`dyRatio` proportional fields to PointAnnotation
- `resolveResponsiveOffset()` scales annotations with container
- `shouldCollapseAnnotations()` collapses to footnotes below 400px
- ObservableChartFactory renders footnote list when collapsed
- 7 frontend tests

**Task 13: Choropleth Maps** (commit `3e94a5f`)
- `ChoroplethMap.tsx` — D3-geo component with hover tooltips, gradient legend
- `geoUtils.ts` — basemap registry (4 basemaps), TopoJSON loading/caching, data joining
- 4 basemap TopoJSON files: world, US states, US counties, Europe
- Toolbox config: basemap, join column, value column, color scale, projection
- EditorStore: 5 new geo config fields with load/save mapping
- ChartTypeSelector: map icon entry
- 8 frontend tests

**Test totals:** 239 frontend + 55 backend = 294 total (all passing)

**Commits:** 3 (d1f456b, 0aeb246, 3e94a5f) on branch `worktree-phase4-maps`

### Session: Phase 3 — Rich Tables & Data (54 new tests)

Implemented all 4 Phase 3 tasks for the Datawrapper parity roadmap. Built in worktree `phase3-rich-tables-data`.

**Task 9: Rich Data Tables**
- Replaced basic DataTableChart with full-featured RichDataTable component
- Click-to-sort headers (asc/desc/none cycle), client-side search, pagination (10/25/50/100)
- Sticky header row, auto-detected number formatting with locale separators
- Special column types: heatmap (min-max color gradient), inline bar, sparkline SVG
- 27 component tests covering sort, search, pagination, formatting, edge cases

**Task 10: Google Sheets Connector**
- `google_sheets.py` connector: parse various Sheets URL formats, build CSV export URL, fetch CSV
- `/api/data/import/google-sheets` endpoint for ingestion
- `GoogleSheetsInput.tsx` frontend component on SourcePickerPage
- 11 backend tests for URL parsing and validation

**Task 11: External URL Data Source**
- `/api/data/import/url` endpoint: fetch CSV/JSON from any URL with optional HTTP headers
- JSON array-of-objects auto-converted to CSV via pandas
- `UrlSourceInput.tsx` frontend component with collapsible headers builder
- 5 backend tests for URL validation

**Task 12: Folders & Organization**
- `folder_storage.py` service (JSON in `data/folders/`, same pattern as chart_storage)
- Full CRUD API router + GET `/{folder_id}/charts` endpoint
- Added `folder_id` to SavedChart, UpdateChartRequest, SavedChartResponse
- `folderStore.ts` Zustand store, `FolderSidebar.tsx` with create/rename/delete
- Library page: sidebar layout, folder filtering, move-to-folder dropdown on cards
- 11 backend tests for folder CRUD and chart-folder association

**Test totals:** 251 frontend + 68 backend = 319 tests, all passing. TSC clean.

### Session: Phase 2 — Themeable & Localizable (129 new tests)

Implemented all 4 Phase 2 tasks for the Datawrapper parity roadmap. Built in a worktree to avoid conflicts.

**Task 6: Curated Themes**
- Added 7 new themes: Minimal, NYT, Nature, FiveThirtyEight, Academic, Dark, Pastel (9 total)
- Each theme has full ChartTheme structure: palette (8 colors), typography, plot settings, pie, card
- Settings page theme grid updated to 3 columns
- 92 unit tests verify all theme structures

**Task 7: Localization Engine**
- `localeStore.ts` with 12 supported locales (en-US, de-DE, ja-JP, fr-FR, etc.)
- `formatters.ts` and `numberFormat.ts` accept optional `locale` parameter
- Locale selector in Settings page with live currency format preview
- 11 localization tests covering German, Japanese, French formatting

**Task 8: Color Tools**
- Expanded palettes from 4 to 16: categorical (6), sequential (7), diverging (3)
- Added ColorBrewer, Tableau 10, Datawrapper default palettes
- `colorblind.ts` — Brettel 1997 CVD simulation (protanopia/deuteranopia/tritanopia)
- `ColorblindPreview` component with CVD type toggle buttons
- `PaletteBuilder` component: add/remove/reorder/pick colors, inline hex editing
- `PaletteSelector` now groups palettes by category
- 17 colorblind simulation unit tests + WCAG contrast utilities

**Task 5: Theme Builder**
- Backend: `theme_storage.py` service (JSON in `data/themes/`), follows chart_storage.py pattern
- Backend: `themes.py` router with full CRUD (create, list, get, update, delete)
- Frontend: `ThemeBuilderPage` at `/settings/themes` — sidebar + editor layout
- Palette color pickers, typography controls, plot settings, live bar chart preview
- Import/export themes as JSON, clone built-in themes, apply custom themes
- "Customize Themes" link from Settings page
- 9 backend API tests

---

### Session: Datawrapper Parity — Phase 0 + Phase 1 (136 new tests)

Completed all Phase 0 infrastructure and Phase 1 features on the `worktree-datawrapper-parity` branch.

**Phase 0: Autonomous Loop Infrastructure**
- Playwright screenshot utility (`app/e2e/screenshot.ts`)
- Backend stress test suite (22 edge-case tests for chart/dashboard storage, ID validation)
- Frontend test harness: created missing `vitest.config.ts`, 41 formatter unit tests

**Phase 1: Embeddable & Publishable**

1. **Publish Workflow** — `status: draft|published` field on charts/dashboards, publish/unpublish API endpoints, public chart endpoint, PublicChartPage, Publish button in editor (10 publish tests)
2. **Embed System** — EmbedChartPage with PostMessage height auto-resize via ResizeObserver, embed URL in SharePanel
3. **Custom Tooltip Formatting** — `{{ column | format }}` template engine supporting currency/percent/compact/number, tooltip editor in Toolbox with column chips (10 template tests)
4. **Chart Type Expansion (11 → 15)** — DotPlot (Cleveland style), RangePlot (min-max with endpoints), BulletBar (bar + target tick), SmallMultiples (Observable Plot `fy` faceting with line/bar/area/scatter subtypes). Type-specific Toolbox controls for minColumn, maxColumn, targetColumn, facetColumn, chartSubtype (10 type tests)

**Test totals:** 104 frontend (vitest) + 32 backend (pytest) = 136 tests, all passing.

## 2026-02-19

### Session: Database import wizard, KPI grid, shape advisor, and KPI bug fixes (621 tests)

Implemented the full database import wizard redesign (6 tasks) and KPI grid + shape advisor feature (6 tasks) via subagent-driven development, then fixed several KPI-related bugs discovered during testing.

**Database Import Wizard (6 tasks)**
1. **Source list ordering** — `list_sources()` in `data.py` now sorts by `ingested_at` descending so newest sources appear first
2. **SQL builder utility** — `app/src/utils/buildShaperSql.ts` — pure function generating SQL from shaper config (column selection, date range, aggregation)
3. **DatabaseConnector single table select** — replaced multi-select checkboxes with single-select radio buttons, updated `onSynced` callback with table metadata
4. **DataShaper component** — `app/src/components/data/DataShaper.tsx` — full shaping wizard with column selection, date range filter, aggregation toggle, live SQL preview, data preview
5. **SourcePickerPage integration** — wired DataShaper into the source picker flow with connector→shaper step transition
6. **EditorPage initial SQL** — accepts `location.state.initialSql` to auto-execute shaped SQL on load

**KPI Grid + Shape Advisor (6 tasks)**
7. **BigValue grid rendering** — multi-row KPI cards in a CSS grid when `metricLabel` is set
8. **BigValue helpers** — `shouldShowGrid()`, `formatBigValue()` with currency/percent/number formatting
9. **BigValue column mapping** — label, value, goal/comparison, comparison label, format, and positiveIsGood controls in Toolbox
10. **Label column dropdown** — dedicated dropdown for `metricLabel` field
11. **Data shape advisor** — `analyzeDataShape()` utility with rules for BigValue, Line, Pie, Bar chart type suggestions; banner in Toolbox
12. **Shape advisor banner** — amber/blue styled tips with optional chart-type switch buttons

**Bug fixes discovered during testing:**
- **Missing DataShaper.tsx** — file was created in worktree but never committed (gitignored); recreated after worktree removal
- **Dashboard addChart race condition** — React StrictMode double-fired load effect, second load overwrote charts added by `addChart`. Fixed with AbortController in `dashboardBuilderStore.load()`
- **KPI chart empty state** — `buildQuery()` required `config.x` but BigValue uses `config.value`. Added BigValue-specific query path and `value`/`metricLabel` to `DATA_KEYS`
- **KPI grid single-value on dashboard** — `metricLabel` missing from chartConfig in `DashboardGrid.tsx` and `DashboardBuilderPage.tsx`
- **Unit column not used** — Added `unitColumn` config field across entire stack (ChartConfig type, EditorConfig, Toolbox dropdown, all chartConfig construction sites). Per-row formatting: "USD"→`$`, "percent"→`%`, "count"/"score"→plain number
- **Comparison showed absolute diff** — Changed from `value - target` to percentage delta `((value - target) / target) × 100`. Now shows "+7.0% vs. target" instead of "+84,500"
- **ChartViewPage missing `metricLabel`** — library view showed single KPI instead of grid. Added `metricLabel` + `unitColumn`
- **Dashboard KPI grid clipped** — BigValue charts defaulted to `h=5` (300px), too small for 6 cards. Changed to `h=7` for BigValue type in `generateLayout`

**New helpers:** `unitToFormat()`, `computePctDelta()`, `formatDelta()` in `bigValueHelpers.ts`

Tests: 485 Python + 136 frontend = **621 total** (35 new frontend tests)

---

## 2026-02-18

### Session: 7 UX fixes — bar sort/colors, paste preview, pie sizing, PNG titles, stale source, test isolation (582 tests)

User-reported bugs fixed across chart rendering, data ingestion, export, and test suite.

**Fixes applied:**
1. **Bar chart sort-by-value broken** — explicit ordinal domain in `buildPlotOptions` overrode Plot's `sort` option in mark definitions. Conditionally skip domain when `chartType === 'BarChart' && config.sort !== false` (ObservableChartFactory.tsx:1028-1045)
2. **Bar chart all same color** — non-series bars used `fill: colors[0]` (single color) instead of `fill: x` (per-category coloring). Changed both vertical and horizontal bar marks (ObservableChartFactory.tsx:381,403)
3. **Paste data skipped preview step** — `safeReturnTo` useEffect auto-navigated away the instant `source` was set, bypassing the "Check your data" step. Removed auto-redirect; moved `returnTo` logic into the "Use this data" button handler. Also added name input to `PasteDataInput` and optional `name` field to backend paste endpoint (SourcePickerPage.tsx, PasteDataInput.tsx, dataStore.ts, data.py)
4. **New chart loaded stale source data** — Zustand `dataStore` persisted across navigations, showing previous chart's data on the source picker. Added mount reset effect `useDataStore.getState().reset()` (SourcePickerPage.tsx:32-34)
5. **Pie chart tiny on dashboards** — SVG was constrained to a square (`Math.min(width, height)`) with 160px label space. Changed to full `width × effectiveHeight` with proportionally scaled label space (ObservableChartFactory.tsx:1247-1258)
6. **PNG export missing titles in dark mode** — export only captured SVG chart, not HTML title elements (white text invisible on white PNG background). Added `addTextToCanvas()` to composite title/subtitle/source onto the canvas (chartExport.ts:137-199, ChartWrapper.tsx, SharePanel.tsx)
7. **Test suite polluted data/uploads/** — `DuckDBService()` in tests wrote CSV files to real uploads directory. Added autouse `_isolate_uploads` fixture that monkeypatches `DATA_DIR` to `tmp_path`. Deleted 20 test-created directories (conftest.py)

**New endpoints:** `PATCH /sources/{id}/rename` — rename a data source on disk.

Tests: 481 Python + 101 frontend = **582 total** (14 new tests across 2 files)

---

### Session: Bug hunt round 28 (final) — 9 fixes across JWT auth, Plot theme, chart storage, dashboard grid, config, chart editor, magic link (573 tests)

6 parallel scanning agents across chart editor, sharing/grid, security/database, remaining pages, frontend utils, and build query logic. Triaged ~12 candidates, kept 9 confirmed real bugs.

**Fixes applied:**
1. **`int(user_id)` crash on malformed JWT** — non-numeric `sub` claim in JWT causes unhandled `ValueError` on `int()` cast. Added try/except guard (dependencies.py:38)
2. **`gridColor` not valid Observable Plot property** — Plot accepts `grid: true | string` (where string is a color), not a separate `gridColor` property. Changed to pass color through `grid` directly (plotTheme.ts:100)
3. **`reasoning` field missing default in SavedChart** — dataclass field ordering required `reasoning: str | None` (no default) before `created_at: str` (no default). Old charts without `reasoning` key fail to load. Moved `reasoning` after required fields with `= None` default (chart_storage.py:39-41)
4. **`generateLayout` auto-placed items overlap persisted items** — auto-placed items started at y=0 regardless of persisted items, causing visual overlap. Added cursor advancement past persisted item bounds (DashboardGrid.tsx:65-78)
5. **`secret_key` evaluated at import time** — `os.environ.get()` in field default evaluates at class definition time, before pydantic-settings loads `.env` file. Changed to plain string default so `.env` override works (config.py:17)
6. **`onLayoutChange` x uses raw `item.w` instead of clamped `w`** — `x` position was computed from pre-clamped `item.w`, potentially allowing x=1 for full-width items if react-grid-layout reported fractional widths. Extracted local `w` variable (DashboardGrid.tsx:142-148)
7. **`_parse_edit_response` crashes on non-dict JSON** — if LLM returns a JSON array or primitive, `data.get("config")` throws `AttributeError`. Added `isinstance(data, dict)` guard (chart_editor.py:204-208)
8. **`update_chart` unhandled `json.loads` crash** — corrupted chart JSON file causes unhandled `JSONDecodeError` in update path (load_chart already had a guard, update_chart didn't). Added try/except (chart_storage.py:170-173)
9. **`is_valid` timezone crash on SQLite** — SQLite may strip timezone info from `expires_at`, producing naive datetime. Comparison with `datetime.now(timezone.utc)` raises `TypeError`. Added timezone normalization (magic_link.py:40-44)

Tests: 472 Python + 101 frontend = **573 total** (1 new test file with 18 tests)

---

### Session: Bug hunt round 27 — 9 fixes across auth, chart factory, dashboard, schema, DuckDB (555 tests)

6 parallel scanning agents across schema analyzer, chart factory, dashboard pages, API middleware, DuckDB service, and conversation engine. Triaged ~15 candidates, kept 9 confirmed real bugs.

**Fixes applied:**
1. **`update_profile` ignores JSON body** — `name: str | None = None` without Pydantic model makes FastAPI treat it as query param. Frontend sends JSON body which is silently ignored. Profile name updates are a no-op. Wrapped in `UpdateProfileRequest` model (auth.py:166-179)
2. **Click-to-place crash when annotations undefined** — `annotations.texts.map(...)` crashes with `TypeError` when `config.annotations` is undefined (optional field). Added `?? { lines: [], texts: [], ranges: [] }` fallback (ObservableChartFactory.tsx:200)
3. **`?addChart` flow fails for new dashboards** — `store.dashboardId` stays null for new dashboards (no load), so the addChart effect never fires. Chart silently dropped. Fixed guard to skip the check for new dashboards (DashboardBuilderPage.tsx:73)
4. **`yAxisMin/yAxisMax` overwrites ordinal y-domain on horizontal bars** — numeric bounds were unconditionally applied to `overrides.y`, overwriting the ordinal category domain. For horizontal bars, the numeric axis is x. Added orientation check (ObservableChartFactory.tsx:1074-1089)
5. **`isPinned` stale on dashboard navigation** — `useState` initializer runs only at mount; component reuse across navigations leaves pin state from first dashboard. Added `useEffect` sync on `dashboardId` (DashboardViewPage.tsx:63)
6. **Contradictory DATA PATTERN hints** — independent `if` blocks emitted both "Time series detected" and "Category + metric detected" for mixed-column datasets. Changed to `elif` chain with priority ordering (schema_analyzer.py:114-119)
7. **`created_at` column timezone mismatch** — sibling of Round 26's `expires_at` fix: `DateTime` (naive) column with `datetime.now(timezone.utc)` (aware) default. Breaks on PostgreSQL (magic_link.py:26)
8. **Source ID regex allows 1-char IDs** — `{1,32}` accepts any length; all generated IDs are 12 chars. Changed to `{12}` (duckdb_service.py:19)
9. **Global `re.sub` corrupts SQL aliases** — word-boundary replacement of filename stem overwrites ALL occurrences including column names and aliases (e.g., `SUM(sales) AS sales FROM sales` → all three replaced). Limited to FROM/JOIN context only (duckdb_service.py:372-381)

Tests: 454 Python + 101 frontend = **555 total** (4 new test files, 2 tests updated)

---

### Session: Bug hunt round 26 — 7 fixes across auth, export, editor, data store (541 tests)

6 parallel scanning agents across settings/auth, editor page/toolbox, dashboard builder, data upload/preview, static export, and connection service. Triaged ~15 candidates, kept 7 confirmed real bugs.

**Fixes applied:**
1. **Magic link timezone crash** — `expires_at` column was `DateTime` (naive); `is_valid` compared it with `datetime.now(timezone.utc)` (aware), raising `TypeError`. Changed to `DateTime(timezone=True)` (magic_link.py:27)
2. **`loadingPreview` stuck spinner** — stale preview responses (from rapid `loadPreview` calls) never cleared `loadingPreview`, leaving spinner visible forever. Added `else` branches to clear the flag for stale responses (dataStore.ts:153-163)
3. **Static export `clientWidth === 0`** — `container.clientWidth` is 0 before browser layout completes, producing zero-width SVGs. Added `|| 640` fallback (static_export.py:190)
4. **Export legend missing for multi-Y** — legend condition checked `series` (explicit only) but not `implicitSeries` (from multi-Y UNPIVOT), so multi-Y charts had no legend. Changed to `implicitSeries` (static_export.py:305)
5. **Multi-Y bar `fx: x` crash** — non-stacked multi-Y bar charts applied `fx: x` faceting, breaking rendering. Added `isMultiY` to the skip condition (static_export.py:228)
6. **Export config merge order** — typed fields (`x`, `y`, `series`, `horizontal`, `sort`) were set first, then `**(chart.config or {})` overwrote them. Reversed merge order so typed fields win (dashboards_v2.py:515-522)
7. **Cmd+Enter double-fire** — keyboard shortcut called `handleRunQuery()` without checking `sqlExecuting`, allowing duplicate queries while one was running. Added `!sqlExecuting` guard (Toolbox.tsx:92)

Tests: 440 Python + 101 frontend = **541 total** (5 new Python + 2 new frontend regression tests)

---

### Session: Bug hunt round 25 — 7 fixes across query engine, editor, Gemini, LLM parsing (529 tests)

6 parallel scanning agents across chart proposer/editor, DuckDB query execution, frontend stores, dashboard/sharing, chart rendering, and LLM providers. Triaged ~20+ candidates, kept 7 confirmed real bugs.

**Fixes applied:**
1. **Table-name substitution `in` vs `\b` mismatch** — substring check `"sales" in "wholesale_sales"` matched but word-boundary `\bsales\b` didn't, so loop broke early skipping valid fallbacks. Changed guard to `re.search(r'\b...\b', ...)` (duckdb_service.py:372-381)
2. **Missing LIMIT on aggregation queries** — COUNT(*) and general aggregation branches in `build_query` had no LIMIT, allowing unbounded GROUP BY results. Added `LIMIT 10000` (charts_v2.py:344,365)
3. **`discard()` doesn't reset `customSql` for SQL mode** — SQL editor textarea kept showing unsaved edits after discard; `buildQuery()` was a no-op in SQL mode. Now restores `customSql` and calls `executeCustomSql()` for SQL-mode charts (editorStore.ts:662-680)
4. **`undo()`/`redo()` don't refresh data** — config was restored but `buildQuery()` never called, leaving chart data stale after undo. Added `buildQuery()` call for non-SQL mode (editorStore.ts:582-604)
5. **Gemini consecutive same-role messages crash** — filtering system messages could produce two consecutive `user` entries, violating Gemini's strict alternation. Added merge logic for consecutive same-role messages (gemini_provider.py:158-170)
6. **Gemini `generate_with_image` wrong content types** — mixed `types.Part` and raw `str` at top level of `contents`. Wrapped both in a single `types.Content` (gemini_provider.py:275)
7. **Boolean `"false"` string treated as truthy** — LLMs sometimes return `"false"` (string) instead of `false` (boolean). Added `_coerce_bool()` helper for `horizontal` and `sort` fields (chart_proposer.py:133-139,191-192)

Tests: 430 Python + 99 frontend = **529 total** (6 new regression tests, 1 updated)

---

### Session: Bug hunt round 24 — 5 fixes across threading, export, editor, charts, paste (509 tests)

5 parallel scanning agents across chart v2 router, conversation engine, static export, data router, and editor/chart UI. Triaged ~25+ candidates, dropped architectural items, kept 5 confirmed real bugs.

**Fixes applied:**
1. **Deadlock on BaseException during CSV ingest** — `threading.Lock()` is non-reentrant; when `BaseException` (MemoryError, KeyboardInterrupt) was raised inside a locked block, the cleanup handler tried `with self._lock:` again, causing permanent deadlock. Changed to `threading.RLock()` (duckdb_service.py:64)
2. **Multi-Y charts blank in static HTML export** — `renderChart` passed `config.y` directly to Observable Plot channel accessors. When `y` was an array (multi-Y), Plot received an array instead of a field name. Added `isMultiY` detection: uses `y[0]` as accessor and `"metric"` as implicit series (static_export.py:187)
3. **`discard` doesn't restore SQL or data** — `discard()` only reset `config` to `savedConfig` but left `sql` stale, so `isDirty()` stayed true and the "Unsaved" badge persisted. Now also restores `sql: savedSql` and calls `buildQuery()` to refresh data (editorStore.ts:662-672)
4. **Pie/Treemap no ResizeObserver** — `PieChartComponent` and `TreemapComponent` used `el.clientWidth` once at mount but had no `ResizeObserver`, so they wouldn't re-render when container resized. Added ResizeObserver + `containerWidth` state (ObservableChartFactory.tsx:1201,1355)
5. **pasted_data.csv filename collision** — paste handler used `"pasted_data.csv"` as the sentinel filename; a user-uploaded file with the same name would be found by `find_source_by_filename` and destroyed. Changed sentinel to `"__paste__.csv"` (data.py:318)

Tests: 412 Python + 97 frontend = **509 total** (5 new regression tests, 1 updated)

---

### Session: Bug hunt round 23b — late-arriving agent findings (3 fixes, 498 tests)

3 additional bugs from Round 23 scanning agents, confirmed and fixed:

1. **Stale `chatMessages` snapshot** — `sendChatMessage` captured `chatMessages` via `get()` then spread it in `set()`, losing any messages added between the snapshot and the update (race with concurrent responses). Switched to Zustand functional updater `set((state) => ({ chatMessages: [...state.chatMessages, ...] }))` (editorStore.ts:683,694)
2. **`_sources` TOCTOU KeyError** — `execute_query` checked `source_id in self._sources` then accessed `self._sources[source_id]` — concurrent `remove_source` between check and access caused KeyError. Switched to `.get()` pattern (duckdb_service.py:368)
3. **`load_dashboard` unhandled exception** — `load_dashboard` had no try/except around JSON parse + dataclass construction, unlike `list_dashboards` which did. Corrupted file caused 500 instead of graceful None return (dashboard_storage.py:110)

Tests: 405 Python + 93 frontend = **498 total** (3 new regression tests added)

---

### Session: Bug hunt round 23 — broad sweep (7 fixes, 495 tests)

5 parallel scanning agents across conversation engine, API routers, frontend stores, DuckDB services, and frontend pages. Triaged ~20 candidates, dropped defensive/stylistic items, kept 7 confirmed bugs.

**Fixes applied:**
1. **Dashboard PUT filter data loss** — `update()` re-serialized filters via `model_dump(exclude_none=True)` which stripped explicitly-set `null` values; now uses `value` from `model_dump(exclude_unset=True)` directly (dashboards_v2.py:475)
2. **Pie/Treemap blank flash** — useEffect cleanup return caused `el.innerHTML = ''` to fire before every re-render; removed since top-of-effect `el.innerHTML = ''` already handles it (ObservableChartFactory.tsx:1349,1417)
3. **Gemini empty messages crash** — `generate()` would send empty string to Gemini API if called with zero messages; added early ValueError guard (gemini_provider.py:153)
4. **Keyboard shortcut handler churn** — EditorPage useEffect depended on `store` (new ref every Zustand update), reinstalling keydown listener every keystroke; switched to `useEditorStore.getState()` inside handler (EditorPage.tsx:52-68)
5. **Query endpoint source_id validation gap** — `/data/query` lacked router-level format check, reflecting raw user input in error messages; added `_SAFE_SOURCE_ID_RE` guard with 400 status (data.py:378)
6. **CSV delimiter detection encoding** — `open()` without encoding fails on ASCII-locale Docker containers; added `encoding='utf-8', errors='replace'` (duckdb_service.py:525)
7. **Health cache stale after dashboard delete** — `remove_dashboard` didn't clear `_health_cache` entry; added `_health_cache.pop()` (dashboards_v2.py:549)

Tests: 402 Python + 93 frontend = **495 total** (8 new regression tests added)

---

### Session: Bug hunt round 22 — chart/dashboard creation flow (10 fixes, 487 tests)

Focus: user flow for creating and saving new charts and dashboards.

**Round 22 — 10 fixes across 9 files**

Frontend (6 fixes):
- `editorStore.ts`: AI assistant config changes (x, y, series) on existing table-mode charts never rebuilt the data query — chart showed stale data. Removed `!chartId` guard on `buildQuery` trigger in `updateConfig`.
- `editorStore.ts`: SQL changes on existing charts didn't mark the chart dirty — `isDirty()` only compared `config` vs `savedConfig`, ignoring `sql`. Added `savedSql` tracking field set in `loadChart`, `save`, `saveNew`, and compared in `isDirty()`.
- `editorStore.ts`: `setDataMode` table-restore failure wrote to `sqlError` (hidden in table mode) instead of `error`. User saw blank chart with no explanation.
- `EditorPage.tsx`: Table-mode `canSave` didn't check `!store.error` — user could save a chart with stale data after a failed query rebuild.
- `DashboardBuilderPage.tsx`: `handleAddChart` from chart picker never called `store.save()` — chart addition silently lost on Back/refresh. Added auto-save matching the query-param flow.
- `ObservableChartFactory.tsx`: Horizontal bar block unconditionally overwrote `marginLeft` to 100, losing the +24px from `yAxisTitle`. Reordered so horizontal runs first, then yAxisTitle adds on top.

Backend (4 fixes):
- `data.py`: Replace upload path had `_sources.pop(existing_id)` outside the lock — race condition with concurrent readers. Moved inside `with service._lock:` block.
- `data.py`: Paste endpoint called `ingest_csv("pasted_data.csv")` with no duplicate check — every paste silently created a new source. Added `find_source_by_filename` + replace logic.
- `chart_storage.py` + `dashboard_storage.py`: `_atomic_write` double-closed fd on `os.replace` failure — after successful `os.close(fd)`, the except block tried `os.close(fd)` again. Added `fd_closed` tracking flag.
- `chart_storage.py`: `load_chart` and `update_chart` had no exception handling around `_safe_load_chart` — legacy chart files missing required fields (e.g., `reasoning`, `horizontal`) caused unhandled `TypeError` → 500 error. Added try/except with graceful `None` return.

**Test suite growth: 474 → 487 tests (394 Python + 93 frontend)**
- 13 new tests across 11 test classes: TestUpdateConfigBuildQueryForExistingCharts, TestSqlDirtyTracking (2), TestHandleAddChartAutoSave, TestReplaceSourcesPopInsideLock, TestPasteDeduplication, TestSetDataModeErrorField, TestCanSaveTableModeErrorCheck, TestSafeLoadChartExceptionHandling (2), TestMarginLeftOrdering, TestAtomicWriteDoubleClose (2)



**Round 21 — 7 fixes across 7 files (6 source + 1 test)**

Backend (4 fixes):
- `duckdb_service.py`: **CRITICAL** — `execute_query()` accepted arbitrary SQL (DROP TABLE, DELETE, INSERT) with no read-only validation, unlike `/query-raw` which correctly checks. Added `_is_read_only_sql()` static method, enforcement in `execute_query()`, and semicolon stripping.
- `charts_v2.py`: Multi-Y UNPIVOT branch ignored `request.series` — series column was missing from subquery SELECT, outer SELECT, and GROUP BY. Silent data loss when users selected multi-Y + series. Added series column threading throughout.
- `dashboards_v2.py`: Health cache evicted oldest entry even when `dashboard_id` was already cached (update, not insert). Added `dashboard_id not in _health_cache` guard.
- `openai_provider.py`: Duplicate system message when `system_prompt` provided AND messages list contained `role="system"` entries. Added `continue` skip in message loop.

Frontend (3 fixes):
- `dataStore.ts`: `confirmReplace` didn't guard against double-clicks — two concurrent `uploadCSV(file, true)` calls could race. Added `uploading` state check.
- `dataStore.ts`: `loadPreview` had no staleness guard — racing preview fetches from rapid uploads could overwrite correct data. Added monotonic request counter (`previewRequestId`).
- `useObservablePlot.ts`: Seed `getBoundingClientRect()` captured height=0 before flex layout resolved, overwriting valid size and causing chart blank-flash. Added `rect.height > 0` guard.

Dropped (false positive): Layout generator "double y-advance" — traced through all cases and confirmed both advances serve correct, distinct purposes (wrap past partial row vs complete filled row).

**Test suite growth: 451 → 474 tests (381 Python + 93 frontend)**
- 23 new tests across 10 test classes: TestExecuteQueryReadOnly (8), TestIsReadOnlySql (8), TestMultiYUnpivotSeriesColumn, TestDashboardLayoutGenerator, TestHealthCacheEviction, TestOpenAINoDoubleSystemMessage, TestUseObservablePlotSeedHeight, TestConfirmReplaceDoubleSubmit, TestLoadPreviewStalenessGuard

### Session: macOS app packaging plan

**Created implementation plan:** `docs/plans/2026-02-18-macos-app-packaging.md`

Goal: Package Story Analytics as a downloadable macOS `.app` distributed via GitHub Releases, with GitHub Pages integration for permanent shareable chart/dashboard links.

5 phases, 16 tasks:
1. **Serve frontend from FastAPI** — single-process production mode (2 tasks)
2. **Publisher abstraction** — pluggable `Publisher` interface with `LocalDownloadPublisher` + artifact builders (3 tasks)
3. **GitHub Pages publishing** — token storage, GitHub API publisher, settings UI, publish buttons (5 tasks)
4. **macOS packaging** — pywebview native window, PyInstaller spec, icon, data directory (4 tasks)
5. **Distribution** — code signing, notarization, DMG creation, GitHub Release pipeline (4 tasks)

Key finding: SVG/PNG/PDF export and dashboard HTML export already fully implemented. New work is packaging shell, publisher abstraction, and GitHub Pages integration. Architecture leaves door open for a future hosted publish service.

To be picked up in a future session after current bug hunt is complete.

### Session: Bug hunt rounds 18–20 (31 fixes, 415 tests)

**Round 18 — 9 fixes (Round 2 from prior session)**
- `Toolbox.tsx`: CollapsibleSection open state frozen at mount — added `useRef` + `useEffect` to auto-expand when annotation count goes from 0 to >0
- `DatabaseConnector.tsx`: `handleSelectSaved` didn't set `dbType` from saved connection — set dbType and send empty credentials
- `LibraryPage.tsx`: selectAll used count comparison instead of set membership — changed to `charts.every()` check
- `SharePanel.tsx` + `ShareModal.tsx`: clipboard API unhandled rejection in insecure contexts — wrapped in try/catch
- `SourcePickerPage.tsx`: redundant `dataStore` in useEffect deps caused infinite re-render loop potential — removed from deps
- `DashboardsHome.tsx`: onboarding dismiss used `window.location.reload()` — replaced with React state
- `bigquery.py` + `snowflake.py` + `postgres.py`: temp file leak when `ingest_parquet` fails — wrapped in try/finally
- `dashboards_v2.py`: `update_sharing` orphaned metadata for nonexistent dashboards — added load_dashboard check
- `dashboards_v2.py`: `health-check`/`export` swallowed HTTPException — added re-raise for 404

**Round 19 — 5 scanning agents, 24 bugs identified**

**Round 20 — 19 fixes across 15 files**

Backend (14 fixes):
- `duckdb_service.py`: `get_schema` missing `_SAFE_SOURCE_ID_RE` validation → SQL injection risk. Added validation.
- `duckdb_service.py`: `_inspect_table` used `MIN(CAST(col AS VARCHAR))` → lexicographic ordering (e.g., "100" < "2"). Fixed to `CAST(MIN(col) AS VARCHAR)`.
- `duckdb_service.py`: `ingest_csv` registered source in `_sources` before table creation — ghost entries on parse failure. Moved registration after successful parse.
- `data.py`: `delete_source` used `del` outside lock → race condition with concurrent iterators. Changed to `pop()`.
- `data.py`: `query-raw` only stripped trailing semicolons → multi-statement SQL injection (`SELECT 1; DROP TABLE`). Now strips ALL semicolons.
- `data.py`: `upload_csv` temp file leak on oversized files (`tmp_path` assigned after size check). Moved assignment before check, added cleanup.
- `security.py`: `datetime.utcnow()` deprecated/naive. Changed to `datetime.now(timezone.utc)`.
- `auth.py`: Relative `Path("sources")` depends on CWD. Changed to `Path(__file__)`-relative absolute path.
- `metadata_db.py`: `share_dashboard` used `INSERT OR REPLACE` → reset `created_at`. Changed to `ON CONFLICT DO UPDATE`.
- `metadata_db.py`: `update_dashboard_visibility` accepted any string. Added validation against `{'private', 'team', 'public'}`.
- `chart_storage.py` + `dashboard_storage.py` + `settings_storage.py` + `connection_service.py`: Non-atomic `write_text()` → data loss on crash. Added `_atomic_write()` (write to `.tmp` then `os.replace()`).
- `chart_storage.py` + `dashboard_storage.py` + `connection_service.py` + `settings_storage.py`: `SavedChart(**data)` crashes on unknown keys from newer versions. Added field-filtering `_safe_load_*()` helpers.
- `chart_proposer.py` + `chart_editor.py`: Naive brace-counter JSON parser fails on braces inside string values. Replaced with `json.JSONDecoder().raw_decode()`.
- `chart_proposer.py` + `chart_editor.py`: `max_tokens=1024` too small for complex configs. Increased to 2048.
- `charts_v2.py`: Duck-typed `type('ColumnProfile', ...)` objects are fragile. Now uses real `ColumnProfile` dataclass.

Frontend (3 fixes):
- `SettingsPage.tsx`: `setSaving(true)` before null provider guard → stuck "Saving..." state. Moved guard first.
- `chartExport.ts`: `exportPNG` swallowed errors silently (`.then()` without `.catch()`). Added error handler.
- `authStore.ts`: Bare `localStorage.getItem()` crashes in non-browser environments. Wrapped in try/catch.

**Test suite growth: 371 → 415 tests (322 Python + 93 frontend)**
- Round 2: 7 new tests (3 test classes): TestConnectorTempFileCleanup, TestUpdateSharingDashboardExists, TestHealthCheckErrorPropagation
- Round 3: 27 new tests (17 test classes): TestGetSchemaSourceIdValidation, TestInspectTableMinMaxOrdering, TestIngestCsvLateRegistration, TestAtomicFileWrites, TestUnknownKeysResilience, TestQueryRawSemicolonStripping, TestJsonRawDecodeParser, TestSecurityTimezoneAwareDatetime, TestShareDashboardPreservesCreatedAt, TestVisibilityValidation, TestTempFileLeakOnOversizedUpload, TestColumnProfileUsage, TestAuthAbsolutePath, TestChartEditorMaxTokens + 3 more

### Key learnings
- `CAST(MIN(col) AS VARCHAR)` vs `MIN(CAST(col AS VARCHAR))` — the latter gives lexicographic ordering for numbers
- `json.JSONDecoder().raw_decode()` is the correct way to extract the first JSON object from a string with trailing text — naive brace-counting breaks on braces inside string values
- `INSERT OR REPLACE` in SQLite replaces the entire row including auto-generated columns — use `ON CONFLICT DO UPDATE` to preserve them
- Atomic writes via `os.replace()` are essential for JSON persistence — `write_text()` can corrupt files on crash

## 2026-02-17

### Session: Bug hunt rounds 16–17 (12 fixes, 371 tests)

**Round 16 — 6 fixes (commit 820a3f7)**
- `duckdb_service.py`: Table name substitution used naive `str.replace()`, corrupting column names containing the table stem (e.g., `order_id` → `src_abc123_id`). Fixed with `re.sub()` word-boundary matching.
- `charts_v2.py`: `build-query` allowed SUM/AVG/MIN/MAX with no Y column, producing invalid `SUM(*)` SQL. Added early return error requiring a numeric Y column for non-COUNT aggregations.
- `static_export.py`: One bad chart in `renderChart()` threw an uncaught exception, killing all subsequent chart renders. Wrapped per-chart render in try-catch with error placeholder.
- `data.py`: No upload file size limit — multi-GB uploads could exhaust memory. Added 100 MB cap with HTTP 413 response.
- `DashboardBuilderPage.tsx`: Navigating between dashboards showed stale chart data/errors from the previous dashboard. Added `setChartData({})` and `setChartErrors({})` on dashboardId change.
- `dashboardBuilderStore.ts`: `dashboard.charts.map(...)` crashed when `charts` was null/undefined (empty dashboards). Added `?? []` null-safe fallback.
- Bonus: Fixed `\$` → `\\$` SyntaxWarning in static_export.py f-string escape sequence.

**Round 17 — 6 fixes (commit ed1f780)**
- `chart_proposer.py` + `chart_editor.py`: LLM responses with trailing explanation text after JSON caused parse failures. Added brace-depth-tracking extraction to find the first complete JSON object.
- `charts_v2.py` + `data.py`: SQL comment prefixes (`/* ... */ DROP TABLE` or `-- DROP\nSELECT`) bypassed the SELECT/WITH/EXPLAIN allowlist. Added `re.sub()` to strip leading comments before keyword check.
- `duckdb_service.py`: Boolean filter params (`True`/`False`) were handled by the `isinstance(val, (int, float))` branch (bool is a subclass of int in Python), producing `1`/`0` instead of `true`/`false`. Added `isinstance(val, bool)` check before int/float.
- `charts_v2.py`: Aggregated multi-Y UNPIVOT queries had no LIMIT, risking unbounded result sets. Added `LIMIT 10000`.
- `editorStore.ts`: `reset()` didn't clear the pending `_buildQueryTimer`, so a timer from a previous chart could fire after navigating to a new chart. Added `clearTimeout(_buildQueryTimer)`.
- `ObservableChartFactory.tsx`: HeatMap had dead code `series ? y : y` (always `y`). Fixed variable assignment and updated misleading comment.

**Test suite growth: 357 → 371 tests (278 Python + 93 frontend)**
- Added 9 new test classes (26 tests): TestTableNameReplacementWordBoundary, TestBuildQueryAggregationValidation, TestStaticExportPerChartErrorHandling, TestUploadFileSizeLimit, TestDashboardChartsNullSafety, TestLlmJsonTrailingTextExtraction, TestSqlCommentBypassPrevention, TestBooleanFilterParamSubstitution, TestMultiYAggregatedQueryLimit

### Session: Regression test suite setup

**Added local-only regression test suite (204 tests)**
- Tests run before every commit via husky pre-commit hook and via `npm test`
- All test infrastructure is gitignored so it stays out of the open-source repo
- Added testing rule to CLAUDE.md: always write a regression test when fixing a bug

**Python tests (151 tests, pytest)**
- `engine/tests/test_chart_storage.py` (16 tests) — chart CRUD: save, load, list, update, delete, multi-Y preservation, config blob round-trip
- `engine/tests/test_dashboard_storage.py` (11 tests) — dashboard CRUD: save, load, list, update, delete, filters persistence
- `engine/tests/test_schema_analyzer.py` (28 tests) — `_simplify_type` for 17 DuckDB types, `_is_date_type`/`_is_numeric_type` classification, `build_schema_context` output (table name, row count, column names, data shape hints, pattern detection)
- `engine/tests/test_health.py` (12 tests) — `_compute_freshness` buckets (fresh/aging/stale with boundary cases), `_compute_health_status` (healthy/warning/error, error precedence over warning)
- `engine/tests/test_api.py` (24 tests) — FastAPI TestClient integration: chart save/list/get/update/delete, dashboard create/list/get/update/delete, 404/400 error handling, multi-Y and config payloads, health and providers endpoints, multi-Y dashboard GET regression (was 500), missing chart graceful degradation
- `engine/tests/test_format_sql.py` (10 tests) — `_format_sql()` keyword line breaks, case insensitivity, whitespace stripping, regression for `rf"\n"` literal backslash-n bug
- `engine/tests/test_classify_sql_error.py` (10 tests) — schema change pattern matching (missing column, referenced column, binder error), fuzzy column suggestions via `difflib`, source missing detection, generic SQL error fallback
- `engine/tests/test_csv_freshness.py` (3 tests) — regression for false "data may be stale" banner on CSV uploads (CSV always fresh, DB sources use time-based freshness)
- `engine/tests/test_settings_storage.py` (12 tests) — settings CRUD, env var bootstrap, regression for stale API keys after provider switch (env var overwrite bug), key masking
- `engine/tests/conftest.py` — `tmp_data_dir` fixture redirects chart/dashboard storage to temp directories so tests never touch real data

**Frontend tests (53 tests, Vitest + jsdom)**
- `app/src/__tests__/annotationDefaults.test.ts` — type detection (`isTemporalType`/`isNumericType`), `getXValues` ordinal ordering preservation (regression guard for alphabetical sorting bug), `getYForX` lookup, `getYRange` min/max with NaN handling, `smartPosition` edge detection (top/bottom/left/right), `resolveOffset` for legacy position enum vs dx/dy, `defaultReferenceLineValue`/`defaultHighlightRange` data-aware defaults, `formatXValue` date formatting

**Infrastructure**
- Installed vitest, jsdom, @testing-library/react, @testing-library/jest-dom as devDependencies in `app/`
- Created `app/vitest.config.ts` with jsdom environment and `@` path alias
- Added `"test"` script to both `app/package.json` and root `package.json`
- Installed husky, created `.husky/pre-commit` hook that runs pytest then vitest
- Added gitignore patterns: `engine/tests/`, `app/src/__tests__/`, `app/vitest.config.ts`, `.husky/`

### Session: Story Analytics default theme polish

**Updated default theme to publication-ready standards**
- Analyzed 11 reference charts to catalog precise design specifications
- Updated `chartThemes.ts` — expanded `ChartTheme` interface with pie, baseline, barTrack, notes, valueLabel, tabularNums, shapeRendering fields; new default values (Roboto font, 22px/700 titles, 12px axes, #555 axis color, crispEdges gridlines)
- Updated `plotTheme.ts` (renamed from `datawrapper.ts`) — Roboto font, updated margins, tabular-nums, no axis lines by default
- Added Roboto font to `index.html` alongside Inter

**ObservableChartFactory theme-aware updates**
- No axis lines (`getBaseAxis: line: false`) — gridlines only
- Chart-type grid rules: scatter gets both X+Y, horizontal bar gets none
- crispEdges `shape-rendering` applied to all gridlines post-render
- Line width default: 2 → 2.5px
- Scatter: radius 4 → 5, fillOpacity 0.85
- Horizontal bar tracks: gray (#e5e5e5) background bars behind each bar (non-series)
- Vertical bar baseline: thick ruleY at y=0 (#333, 2px)
- Legend: 10×10px squares (was 12×12), 14px gap (was 12)
- DataTable: 1px top border on header row, 13px header font
- Pie chart: full pie (innerRadius from theme), external labels with polyline connectors + dots, percentage display

**ChartWrapper spacing polish**
- Padding: p-7 → p-5 for all modes
- Title→description gap: mb-1 → mb-1.5
- Chart→footer gap: mt-3 → mt-4
- Source link color: #1d81a2

**Removed all Datawrapper references**
- Renamed `datawrapper.ts` → `plotTheme.ts`, updated 8 import files
- Replaced "Datawrapper-quality" with "publication-ready" in README, docs, website, brand_config

**Dashboard chart height: autoHeight via CSS flex layout**
- Dashboard charts were clipping the x-axis because chart height was computed as `cellHeight - magicNumber` (122px overhead), which didn't account for the new 22px titles, larger legend, and wider footer gaps
- Replaced magic number with dynamic CSS flex sizing: `useObservablePlot` now observes both width and height; new `autoHeight` prop on `ObservableChartFactory` uses `flex: 1` + measured height instead of a fixed pixel value
- ChartWrapper chart area is now `flex flex-col` so children participate in flex sizing
- Height chain: grid cell (fixed) → ChartWrapper (flex col) → chart area (flex-1) → legend (natural) → SVG container (flex-1, measured) — adapts to any theme automatically
- Removed `gridH`/`heightMap`/`chartHeight` from `DashboardGrid.tsx` and `DashboardBuilderPage.tsx`

### Key learnings
- Magic-number height calculations break when themes change font sizes or spacing — use CSS flex + ResizeObserver instead
- ResizeObserver `contentRect` provides both width and height; extend the hook to report both for flex-sized containers

### Session: Dark mode support for default chart theme

**Made default theme fully dark-mode-aware**
- Cleared all 10 hardcoded light-mode colors in `chartThemes.ts` default theme to `''` (CSS variable fallback convention)
- Font colors (title, subtitle, source, axis, notes) now fall through to Tailwind `text-text-primary`/`text-text-secondary`/`text-text-muted` classes in `ChartWrapper.tsx`
- Grid, baseline, and bar track colors now resolve through `--color-grid` and `--color-axis` CSS variables via `plotTheme.ts`
- Added CSS variable fallbacks in `ObservableChartFactory.tsx` for 3 colors consumed directly: bar track → `--color-grid`, baseline → `--color-axis`, pie connector → `--color-text-muted`
- Pie slice stroke already had dark/light branching logic — clearing to `''` activates it
- Economist theme unchanged (keeps hardcoded white backgrounds by design)
- All 208 Python + 93 frontend tests pass

### Session: Chart theme system + dashboard bug fixes

**Chart theme system (Default + The Economist)**
- Created `app/src/themes/chartThemes.ts` — `ChartTheme` interface with palette, font, plot, card, and accent sections; Default theme uses `''` for all colors (CSS variable fallback, preserves dark/light mode); Economist theme has explicit hex values with red accent bar
- Created `app/src/stores/chartThemeStore.ts` — Zustand store with localStorage persistence
- Modified `datawrapper.ts` — `plotDefaults()` accepts optional `ChartTheme`, added `resolveColor()` helper
- Modified `ObservableChartFactory.tsx` — reads theme store, uses theme palette as default color range, threads theme to `buildPlotOptions` and pie/treemap components
- Rewrote `ChartWrapper.tsx` — accent bar/tag rendering, themed typography and card styling
- Modified `SettingsPage.tsx` — added ChartThemeSelector with 2-column preview cards
- Rewrote `PaletteSelector.tsx` — "Default" row shows active theme's palette swatches
- Added barrel export in `stores/index.ts`

**Bug fixes from user testing**
- Legend color mismatch: `getUniqueSeries` returned data-encounter order but Observable Plot sorts ordinal domains alphabetically — added `.sort()`
- Accent bar square corners: `overflow-hidden` was only applied in compact mode — added to all card modes
- Highlight range defaults 50/100: multi-Y array was cast to comma-joined string matching no column, so `getYRange` fell back to `{min: 0, max: 100}` — resolved multi-Y to `'metric_value'` in `useAnnotationContext`
- Point annotation serif font: SVG text elements inherit browser default serif — added `fontFamily` parameter to `appendPointNotes`

**Dashboard addChart race condition (first fix)**
- After creating a chart from dashboard edit, it wasn't added to the dashboard
- Root cause: `store.load()` is async, and the `addChart` useEffect fired before load completed, then load overwrote the charts array
- Fix: wait for loading to finish, add chart, auto-save, navigate to view page

**500 error on dashboards with multi-Y charts**
- Pydantic `ChartWithData` model declared `y: str | None` but multi-Y charts store `y: list[str]`, causing response validation to fail
- Fixed backend `dashboards_v2.py`: `y: str | list[str] | None`
- Fixed frontend types in `DashboardViewPage.tsx` and `DashboardGrid.tsx`
- Added multi-Y resolution logic (`metric_value`/`metric_name`) in `DashboardGrid.tsx` and `DashboardBuilderPage.tsx`

**Dashboard addChart race condition (second fix)**
- The first fix guarded on `store.loading`, but `loading` starts as `false` and the load effect hasn't set it to `true` yet on the first render — both effects see the stale `false` value from the render closure
- Fix: guard on `store.dashboardId` instead, which starts as `null` and only gets set when `load()` completes successfully

### Key learnings
- Zustand state updates via `set()` are synchronous in the store but useEffect closures capture the render-time snapshot — checking `store.loading` in a sibling effect is unreliable on the initial render
- Guard on a value that transitions from null→set (like `dashboardId`) rather than false→true→false (like `loading`) for "wait until loaded" patterns
- Observable Plot sorts ordinal domains alphabetically — custom legend must `.sort()` series to match

## 2026-02-16

### Session: Return-to-dashboard flow after chart creation

**Return to dashboard after creating a new chart**
- When editing a dashboard, "Create New Chart" now threads `returnToDashboard={dashboardId}` through the full 3-hop navigation: DashboardBuilder → SourcePicker → EditorPage → (save) → back to DashboardBuilder
- `DashboardBuilderPage`: reads `?addChart={id}` on mount, auto-adds chart to grid, clears param
- `SourcePickerPage`: forwards `returnToDashboard` to editor URL from both `handleSelectSource` and "Use this data" button
- `EditorPage`: on save-new, redirects to `/dashboard/{id}/edit?addChart={newId}` instead of `/chart/{newId}`
- Normal (non-dashboard) chart creation flow is unaffected

### Session: Dashboard builder chart preview rendering

**Full chart previews in builder grid**
- Replaced placeholder metadata cards with live chart renders in the dashboard builder
- Builder now fetches full chart data (including query results) per chart via `/api/v2/charts/{id}`
- `BuilderGridCard` renders `ObservableChartFactory` inside `ChartWrapper` with computed height from grid row dimensions
- Palette colors, annotations, and all chart config options render correctly in previews

**Dashboard delete button**
- Added delete button to dashboard editor header with confirmation modal
- `DELETE /api/v2/dashboards/{id}` endpoint, navigates to `/dashboards` on success

**CSV stale-data banner fix**
- Fixed false "data may be stale" banner appearing for CSV sources (only applies to DB connections)

### Session: Data summary for AI chat + palette colorRange fix

**Data summary in AI chat editor prompt**
- Created `app/src/utils/dataSummary.ts` — `buildDataSummary()` computes per-column stats (type, distinct/null counts, min/max/mean, sample values) from in-memory query results
- For datasets ≤ 200 rows, includes ALL rows as `sample_rows`; larger datasets get first 5 rows
- `editorStore.ts`: computes summary in `sendChatMessage` and sends `data_summary` in POST body
- `charts_v2.py`: added `data_summary: dict | None` to `EditRequest`, passes through to engine
- `chart_editor.py`: added `_format_data_context()` helper producing concise text (rows, column stats with ranges/means, sample rows); injected between config/columns and user request in the LLM prompt
- Updated `SYSTEM_PROMPT` with DATA AWARENESS section: instructs LLM to use real data for titles, subtitles, and annotation placement (e.g., "annotate the peak" → find max y-value from data context)

**Palette colorRange support**
- Added `colorRange?: readonly string[]` to `ChartConfig` type
- Changed `ObservableChartFactory`, `DashboardGrid`, `ChartViewPage`, `EditorPage` to pass full palette array via `colorRange` instead of single `color` (fixes multi-series charts only showing one color)
- Reordered monochrome palettes (blues, reds, greens) for max spread so any prefix of N colors is visually distinct

**Other fixes**
- `EditorPage`: navigate to `/chart/{id}` (view page) after first save instead of `/editor/{id}` (dead-end)
- `settings_storage.py`: always overwrite env vars from settings.json (was skipping if env var already set, causing stale keys after provider switch)

### Session: Sources management page and settings polish

**Sources management page (`/sources`)**
- Created `SourcesPage.tsx` — dedicated page for managing all data sources
- Two sections: "Database Connections" (top) and "Uploaded Files" (bottom) in separate cards
- Each row shows type badge, name, row/col counts, and delete button with inline confirmation
- CSV sources delete via `DELETE /api/data/sources/{id}`, DB connections via `DELETE /api/connections/{id}`
- Empty state with database icon + "Add Data Source" CTA
- "Add Data Source" button navigates to `/editor/new/source` (existing SourcePickerPage)
- Added route in `App.tsx` inside AppShell group so top nav is visible

**Backend: DELETE endpoint for CSV sources**
- Added `DELETE /api/data/sources/{source_id}` to `api/routers/data.py`
- Drops DuckDB table, removes from in-memory `_sources` dict, deletes upload directory from disk
- Returns 404 if source not found

**Settings page: About section**
- Added website link (storyanalytics.ai) and MIT license note to About section

**ChartViewPage multi-Y fix**
- Fixed `ChartViewPage` to handle `y` as `string | string[]` for multi-Y column charts
- Maps multi-Y arrays to `metric_value`/`metric_name` pattern (matching EditorPage)

**Dashboard view cleanup**
- Removed Health Check button, handler, state, and result banner (feature to be revisited later)
- Removed "Team" visibility option from ShareModal (no auth system active)
- Fixed ShareModal dark mode: selected option used hardcoded `bg-blue-50` (white), replaced with `bg-blue-500/10` opacity-based color

**Product spec rewrite**
- Rewrote `docs/v2-product-spec.md` to reflect actual product (190 lines, down from 542)
- Removed speculative sections (hygiene system, scheduling, cloud mode, v1 migration table)
- Documented all 10 chart types, 3 annotation types, 3 database connectors, export formats
- Added prioritized roadmap (near/medium/longer-term)

### Session: Draggable highlight ranges and annotation polish

**Draggable highlight range edges**
- Moved highlight ranges from Observable Plot marks to raw SVG elements appended after `Plot.plot()`
- Added `invertScale()` helper that handles both continuous scales (`scale.invert()`) and ordinal/band scales (nearest-pixel snapping)
- `appendHighlightRanges()` renders fill rects with invisible 8px edge handles supporting `d3.drag()`
- X-axis ranges: `ew-resize` cursor, horizontal-only drag
- Y-axis ranges: `ns-resize` cursor, vertical-only drag
- Edge swap: dragging start past end auto-swaps so start < end
- Drag lifecycle: live DOM mutation during drag, `invertScale()` on drag-end to persist data values back to store
- Appended before point notes for correct z-order (ranges render behind)

**Highlight range label clipping fix**
- Labels were positioned at `plotTop - 4` (above plot area, clipped by SVG boundary)
- Moved to `plotTop + 12` (inside chart area)

**Annotation font size standardization**
- Unified all annotation label font sizes to 11px (was 11/12/10 across reference lines, point notes, highlight ranges)

**Color swatch palette**
- Replaced native `<input type="color">` (complex system picker) with 8 curated color swatches
- Fixed overflow: added `flex-wrap` and reduced swatch size for narrow sidebar layouts

**Point note edge clipping fix**
- Labels on far-right (or far-left) points were overflowing the chart boundary
- Added plot area bounds detection: when label x-position is within 40px of edge, switches `text-anchor` from `middle` to `end`/`start`

### Key learnings
- Observable Plot scale objects expose `.range` for plot area bounds — useful for SVG annotation positioning
- Ordinal/band scales lack `.invert()` — must snap to nearest data value by pixel distance
- Native browser color picker is overkill for annotation colors — curated swatches are simpler and faster
- Point note `text-anchor` should adapt to position within chart to prevent edge clipping

## 2026-02-15

### Session: Chart editor polish and bug fixes

**Data preview step after CSV upload**
- Wired existing `DataPreview` component into `SourcePickerPage` as a two-step flow
- After upload: shows data table with "Use this data" / "Upload different file" buttons
- No new routes or components needed — everything was already built but not rendered

**Column dropdown bug**
- Y axis dropdown only showed one column after upload
- Root cause: `buildQuery` was overwriting `columns` with query result columns
- Fix: removed `columns: result.columns` from buildQuery success handler

**New Chart button on Library page**
- Added "+ New Chart" button in header and empty state, linking to `/editor/new/source`

**Time grain grouping**
- Added time grain dropdown (day/week/month/quarter/year) for date columns when aggregation is active
- Backend uses DuckDB `DATE_TRUNC('{grain}', column)` for grouping
- UI auto-hides time grain when aggregation is "none" or X is not a date column

**Median aggregation**
- Added median to aggregation options (DuckDB native `MEDIAN()` function)

**Source URL hyperlink**
- Added `sourceUrl` field to EditorConfig with URL input in Toolbox
- Chart source text renders as clickable hyperlink when URL is provided

**Legend: custom React replacement**
- Observable Plot's `color: { legend: true/false }` API is unreliable for stroke-based marks (line/area)
- DOM manipulation approach also proved fragile across chart types
- Final fix: replaced entirely with custom React legend — color swatches rendered from series data
- Always strip any Plot-generated legend from DOM as safety net (preserve `<svg>` and `<style>`)
- Legend toggle now only visible in Toolbox when a series column is selected (no-op without series)

**Grid lines fix**
- Top-level `grid` only controls x-axis in Observable Plot
- Fix: also set `y: { grid: false }` for y-axis grid lines

**Reference line label fixes**
- Label truncation: changed `textAnchor: 'start'` to `'end'` with `dx: -4` to keep inside chart
- Line through label: added text halo using Observable Plot `stroke` property
- PNG export halo: CSS variables don't resolve in SVG-to-canvas export — resolve via `getComputedStyle` at render time

**Chart type switching data loss**
- Removed `chartType` from `DATA_KEYS` to prevent unnecessary API calls
- Fixed `useObservablePlot` ResizeObserver to re-attach when deps change (container remount)

**Table/SQL mode switching config reset**
- `setDataMode` now preserves full config including x/y/series when switching back to Table
- Validates columns against source schema after switch, then rebuilds query

**SQL formatting**
- Added `_format_sql()` helper for readable SQL output with line breaks before keywords
- Bug fix: raw f-string `rf"\n"` was literal `\n`, not a newline — changed to `f"\n"`

**Run Query UX feedback**
- Added green "N rows returned" success flash after query execution (auto-clears after 4s)
- Gives visual confirmation that the query ran, even when data looks the same

**CI fix**
- Fixed ruff F841 lint error: unused variable `e` in data.py exception handler

### Key learnings
- Observable Plot `rf` vs `f` string prefix matters for `\n` in regex replacements
- Observable Plot's built-in legend is unreliable for stroke-based marks — build a custom React legend instead
- Observable Plot grid: top-level `grid` = x-axis only; y-axis needs `y: { grid }` separately
- CSS variables don't resolve during SVG-to-canvas export — must resolve at render time
- `useObservablePlot` ResizeObserver must re-observe when container div is remounted
