# Datawrapper Parity — Progress Tracker

> **Design doc:** `docs/plans/2026-02-24-datawrapper-parity-design.md`
> **Implementation plan:** `docs/plans/2026-02-24-datawrapper-parity-plan.md`

## Current Phase: 8 — Data Transforms, Edit History, CSV Download (COMPLETE)

### Task 0: Development Loop Setup ✅
- [x] Screenshot verification (Playwright)
- [x] Backend stress test suite (22 edge-case tests)
- [x] Frontend component test harness (vitest.config.ts + 41 formatter tests)

## Phase 1: Embeddable & Publishable ✅

### Task 1: Publish Workflow ✅
- [x] Backend: Add `status` field to chart/dashboard storage (`draft` | `published`)
- [x] Backend: Publish/unpublish API endpoints
- [x] Backend: Public chart endpoint (no auth, only serves published)
- [x] Frontend: Publish button in editor
- [x] Frontend: PublicChartPage (read-only, no editor chrome)
- [x] Frontend: Route `/public/chart/:id`
- [x] Tests: pytest for publish/unpublish flow (10 tests)
- [x] Tests: Screenshot verify published view

### Task 2: Embed System ✅
- [x] Embed page route and component (`EmbedChartPage`)
- [x] Separate Vite entry point for embed bundle (2.62KB gzipped)
- [x] Embed code generator in SharePanel (iframe snippet)
- [x] PostMessage height auto-resize
- [x] Privacy headers (SecurityHeadersMiddleware — 18 tests)
- [x] Tests: Embed renders correctly (Playwright `embed.spec.ts`)
- [x] Tests: Screenshot verify embed at desktop + mobile (Playwright `embed.spec.ts`)

### Task 3: Custom Tooltip Formatting ✅
- [x] Tooltip template parser (`{{ column | format }}`)
- [x] Tooltip editor UI in Toolbox
- [x] Observable Plot tooltip integration (wired through ChartConfig)
- [x] Tests: Template parsing unit tests (10 tests)
- [x] Tests: Screenshot verify tooltips

### Task 4: Chart Type Expansion (11 → 15) ✅
- [x] Dot plot (Cleveland style)
- [x] Range plot (min-max bars)
- [x] Bullet bar (bar + target marker)
- [x] Small multiples (Observable Plot faceting with line/bar/area/scatter subtypes)
- [x] Tests: Type system + config field tests (10 tests)
- [x] Tests: Screenshot verify each type (Playwright `chart-types.spec.ts`)

## Phase 2: Themeable & Localizable ✅

### Task 5: Theme Builder ✅
- [x] Backend: Theme storage service (JSON in `data/themes/`)
- [x] Backend: Theme CRUD API endpoints (9 tests)
- [x] Frontend: ThemeBuilderPage (`/settings/themes`)
- [x] Frontend: Color pickers for all theme properties
- [x] Frontend: Live preview (sample chart re-renders as theme changes)
- [x] Frontend: Import/export theme as JSON
- [x] Tests: Theme CRUD API tests (9 passing)
- [x] Frontend: Font picker (Google Fonts + file upload) — 50 curated fonts, searchable, upload .woff2/.ttf
- [x] Frontend: Logo uploader with position control — 4-corner positioning, size slider
- [x] Frontend: Custom CSS override textarea (ThemeBuilderPage)
- [x] Tests: Screenshot verify theme builder page

### Task 6: Curated Themes (9 total) ✅
- [x] Minimal (Helvetica, no chrome)
- [x] Economist (existing, retained)
- [x] NYT (Franklin Gothic, gray grid, red accent)
- [x] Nature (serif headers, blue palette)
- [x] FiveThirtyEight (bold headers, signature palette)
- [x] Academic (Times New Roman, APA-style, grayscale-friendly)
- [x] Dark (dark background, vibrant accents)
- [x] Pastel (soft colors, friendly)
- [x] Tests: 92 unit tests verifying all theme structures
- [x] Tests: Screenshot same chart in all 9 themes (Playwright `themes.spec.ts`)

### Task 7: Localization Engine ✅
- [x] Locale store (`localeStore.ts`) with 12 supported locales
- [x] Extend formatters.ts to accept locale parameter
- [x] Extend numberFormat.ts to accept locale parameter
- [x] Locale selector in Settings page with live preview
- [x] Tests: German, Japanese, French formatting (11 tests)
- [x] Per-chart locale override option (Toolbox locale dropdown)
- [x] Tests: Screenshot with non-US locale

### Task 8: Color Tools ✅
- [x] Custom palette builder (add/remove/reorder colors)
- [x] Palette types: categorical (6), sequential (7), diverging (3)
- [x] Colorblind preview (protanopia/deuteranopia/tritanopia simulation)
- [x] Expand preset palettes (4 → 16: ColorBrewer, Tableau, DW defaults)
- [x] ColorblindPreview component with CVD type toggle
- [x] PaletteBuilder component with inline color editing
- [x] Tests: 17 colorblind simulation unit tests
- [x] Tests: Screenshot palette builder UI

## Phase 3: Rich Tables & Data ✅

### Task 9: Rich Data Tables ✅
- [x] RichDataTable component (replace DataTableChart)
- [x] Column types: text, number, heatmap, bar, sparkline
- [x] Click-to-sort headers
- [x] Search bar (client-side filtering)
- [x] Pagination (10/25/50/100 rows)
- [x] Sticky header row
- [x] Per-column formatting and conditional coloring
- [x] Tests: Sort, search, pagination logic (27 tests)
- [x] Tests: Screenshot with heatmap + sparkline columns

### Task 10: Google Sheets Connector ✅
- [x] Backend: Parse Sheets URL → extract sheet ID
- [x] Backend: Fetch via public CSV export URL
- [x] Backend: Configurable polling interval (30s, 1m, 5m, 15m)
- [x] Frontend: GoogleSheetsInput component
- [x] Tests: URL parsing, CSV fetch (11 tests)
- [x] Frontend: Auto-refresh on embed load with configurable interval

### Task 11: External URL Data Source ✅
- [x] Backend: Fetch CSV/JSON from any URL
- [x] Backend: Optional HTTP headers for auth
- [x] Backend: Cache with staleness indicator (file-based TTL cache, X-Data-Staleness header)
- [x] Frontend: UrlSourceInput component
- [x] Tests: URL fetch, validation (5 tests)

### Task 12: Folders & Organization ✅
- [x] Backend: Folder storage service
- [x] Backend: Folder CRUD API
- [x] Frontend: Folder tree sidebar in library
- [x] Frontend: Move-to-folder dropdown on chart cards
- [x] Frontend: Search across all items
- [x] Tests: Folder CRUD, chart-folder association (11 tests)
- [x] Frontend: Drag-and-drop charts into folders (@dnd-kit)

## Phase 4: Maps ✅

### Task 13: Choropleth Maps ✅
- [x] ChoroplethMap component (D3-geo + TopoJSON)
- [x] Basemaps: world countries, US states, US counties, Europe
- [x] Data join: match column to geography ID or name
- [x] Color scale: sequential + diverging
- [x] Legend: gradient with min/max labels
- [x] Tooltips: hover shows region + value
- [x] geoUtils: basemap registry, TopoJSON loading, data joining, projections
- [x] Toolbox: basemap, join column, value column, color scale, projection selectors
- [x] EditorStore: geo config fields (basemap, geoJoinColumn, geoValueColumn, geoColorScale, geoProjection)
- [x] Tests: 8 unit tests (basemap registry, data joining, type registration)
- [x] Custom GeoJSON/TopoJSON upload (file input in Toolbox + ChoroplethMap support)
- [x] Map zoom & pan (d3-zoom, +/-/Reset controls, touch support)
- [x] Tests: Screenshot verify map at multiple projections

### Task 14: Responsive Annotations ✅
- [x] Store proportional positions (dxRatio/dyRatio) alongside pixel positions
- [x] Recalculate on resize via resolveResponsiveOffset()
- [x] Collapse to footnotes below 400px via shouldCollapseAnnotations()
- [x] Tests: 7 unit tests (responsive offsets, ratio computation, collapse threshold)
- [x] Tests: Screenshot at desktop vs mobile

### Task 15: Chart Templates & Duplication ✅
- [x] Backend: Duplicate chart endpoint (POST /v2/charts/{id}/duplicate)
- [x] Backend: Template storage service (template_storage.py)
- [x] Backend: Template CRUD API (templates.py router)
- [x] Backend: Save-as-template endpoint (POST /v2/charts/{id}/save-as-template)
- [x] Frontend: Duplicate action in library (Duplicate button on ChartCard)
- [x] Frontend: Save as template (Template button in EditorPage header)
- [x] Tests: 14 backend tests (duplication, template CRUD, save-as-template)
- [x] Frontend: Template gallery in chart creation (TemplateGallery modal, editor query param)

## Phase 5: Parity Gaps ✅

### Task 5.1: Separate Vite Embed Entry Point ✅
- [x] embed.html + embed-entry.tsx + EmbedApp.tsx
- [x] Multi-page Vite build (index.html + embed.html)
- [x] Tree-shaken: no router, no Zustand, no AI chat
- [x] Embed entry: 2.62 KB (1.19 KB gzipped)

### Task 5.2: Archive/Soft-Delete with Restore ✅
- [x] Backend: archived_at field, archive/restore endpoints
- [x] Backend: ?status=active|archived|all query param
- [x] Frontend: Active/Archived toggle, archive/restore buttons
- [x] Tests: 11 pytest tests

### Task 5.3: Static Fallback PNG for Embeds ✅
- [x] Backend: Snapshot upload/serve endpoints (data/snapshots/)
- [x] Frontend: <noscript> fallback + og:image meta tag
- [x] Auto-generate PNG on publish
- [x] Tests: 5 pytest tests

### Task 5.4: Dashboard Embed ✅
- [x] Backend: GET /v2/dashboards/{id}/public endpoint
- [x] Frontend: EmbedDashboardPage with PostMessage resize
- [x] Route: /embed/dashboard/:dashboardId
- [x] Embed code generator in ShareModal
- [x] Tests: 5 pytest tests

### Task 5.5: Font Picker ✅
- [x] FontPicker component: 50 Google Fonts, searchable, upload .woff2/.ttf
- [x] fontUrl field on ChartTheme
- [x] Font injection via <link>/<style> tags
- [x] Tests: 9 vitest tests

### Task 5.6: Logo Uploader ✅
- [x] logoUrl, logoPosition, logoSize on ChartTheme
- [x] ThemeBuilderPage: upload, position radio, size slider
- [x] ChartWrapper: absolutely positioned logo image
- [x] Tests: 9 vitest tests

### Task 5.7: Configurable Polling Interval ✅
- [x] refreshInterval in chart config
- [x] Auto-refresh dropdown in Toolbox (off, 30s, 1m, 5m, 15m)
- [x] EmbedChartPage: setInterval re-fetch with cleanup
- [x] Tests: 14 vitest tests (refresh + staleness)

### Task 5.8: Cache with Staleness Indicator ✅
- [x] data_cache.py: file-based cache with TTL
- [x] URL and Google Sheets imports use cache
- [x] X-Data-Staleness response header
- [x] Staleness indicator in embed footer
- [x] Tests: 9 pytest tests

### Task 5.9: Map Zoom & Pan ✅
- [x] d3-zoom behavior on ChoroplethMap SVG
- [x] +/-/Reset zoom controls (top-right)
- [x] Touch support (pinch-to-zoom)
- [x] Tests: 4 vitest tests

### Task 5.10: Template Gallery ✅
- [x] TemplateGallery component with search
- [x] "From Template" button in LibraryPage (modal)
- [x] EditorPage loads template config from query param
- [x] Tests: 5 vitest tests

### Task 5.11: Drag-and-Drop Folders ✅
- [x] @dnd-kit/core: DraggableChartCard + DroppableFolderItem
- [x] Visual feedback: highlight on hover, ghost drag preview
- [x] Tests: 5 vitest tests

## Phase 6: Final Datawrapper Parity ✅

### Task 6.1: Screenshot Verification (8 Deferred E2E Tests) ✅
- [x] Published view screenshot
- [x] Tooltips screenshot
- [x] Theme builder page screenshot
- [x] Non-US locale screenshot
- [x] Palette builder UI screenshot
- [x] Rich table with heatmap + sparkline screenshot
- [x] Map at multiple projections screenshot
- [x] Responsive annotations desktop vs mobile screenshot

### Task 6.2: Shared Geo Hook ✅
- [x] Extract useGeoMap hook from ChoroplethMap (~160 lines)
- [x] Refactor ChoroplethMap to consume hook (328→175 lines)

### Task 6.3: New Map Types (Symbol, Locator, Spike) ✅
- [x] GeoPointMap component with mapVariant prop
- [x] Symbol map: circles sized by value (d3.scaleSqrt)
- [x] Locator map: pin markers with text labels
- [x] Spike map: vertical lines proportional to value
- [x] Type registration across 7 files (chart.ts, editorStore, factory, selector, toolbox, editor, dashboard)
- [x] Tests: 12 vitest tests

### Task 6.4: PowerPoint Export ✅
- [x] pptxgenjs dependency (lazy-loaded)
- [x] exportPPTX() in chartExport.ts
- [x] PPTX button in ChartWrapper export row
- [x] Tests: 8 vitest tests

### Task 6.5: Dark Mode Auto-Detection for Embeds ✅
- [x] ?theme=dark|light|auto query param on EmbedChartPage
- [x] prefers-color-scheme media query listener
- [x] PostMessage override (sa-theme)
- [x] Dark styles for embed pages
- [x] Same for EmbedDashboardPage
- [x] Tests: 11 vitest tests

### Task 6.6: OpenAPI Documentation ✅
- [x] Enhanced FastAPI constructor (description, version 0.2.0, openapi_tags)
- [x] All router docstrings + Pydantic Field examples enriched

### Task 6.7: API Key Authentication ✅
- [x] api_keys table in metadata_db.py
- [x] api_key_service.py (generate, verify with SHA-256)
- [x] api_keys.py router (create, list, revoke)
- [x] auth_simple.py extended for X-API-Key header + ?api_key= param
- [x] ApiKeyManager component in SettingsPage
- [x] Tests: 9 pytest + 3 vitest tests

### Task 6.8: Comments System ✅
- [x] comments table (polymorphic: chart or dashboard, threaded, soft-delete)
- [x] Comments CRUD in metadata_db.py
- [x] comments.py router (POST, GET, PUT, DELETE)
- [x] commentStore.ts (Zustand)
- [x] CommentInput, CommentThread, CommentSidebar components
- [x] EditorPage: AI Chat / Comments tab switcher
- [x] Tests: 10 pytest + 7 vitest tests

### Task 6.9: Teams ✅
- [x] teams + team_members tables
- [x] Teams CRUD in metadata_db.py
- [x] teams.py router (CRUD + membership management)
- [x] TeamManager component in SettingsPage
- [x] Tests: 8 pytest tests

### Task 6.10: Notifications ✅
- [x] notifications table
- [x] Notifications CRUD in metadata_db.py
- [x] notifications.py router (list, unread-count, mark-read, mark-all-read)
- [x] notificationStore.ts (Zustand, 60s polling)
- [x] NotificationBell + NotificationDropdown components
- [x] TopNav: NotificationBell integration
- [x] Tests: 6 pytest + 4 vitest tests

## Phase 7: Embed Flags, Chart Types, Accessibility ✅

### Task 7.1: Embed Render Flags (Session K) ✅
- [x] parseEmbedFlags utility (5 query params)
- [x] EmbedChartPage: plain, static, transparent, logo, search
- [x] EmbedDashboardPage: same flags + DashboardGrid passthrough
- [x] RichDataTable: initialSearch via extraProps
- [x] ChartWrapper: hideLogo prop
- [x] Tests: 33 vitest tests (12 parser + 17 embed + 4 table)

### Task 7.2: Chart Types — 19 → 25 (Session L) ✅
- [x] StackedColumn (barY with fill stacking)
- [x] GroupedColumn (barY with fx faceting)
- [x] SplitBars (diverging barX, leftColumn/rightColumn)
- [x] ArrowPlot (dot + link marks, startColumn/endColumn)
- [x] ElectionDonut (custom D3 hemicycle component)
- [x] MultiplePies (small-multiples grid, pie/donut variant)
- [x] ChartTypeSelector entries with SVG icons
- [x] Toolbox conditional fields for new types
- [x] Tests: 23 vitest tests

### Task 7.3: Accessibility — WCAG AA Essentials (Session M) ✅
- [x] altText field in ChartConfig + editor Toolbox textarea
- [x] ARIA attributes on SVG charts (role=img, aria-label, aria-describedby)
- [x] Auto-generated screen reader summary
- [x] Keyboard focus indicators (tabIndex, focus ring)
- [x] Keyboard sort on table headers (Enter/Space)
- [x] checkPaletteAccessibility utility (contrast ratio warnings)
- [x] ColorblindPreview: Safe/Warning badges, problematic swatch highlighting
- [x] EmbedChartPage: meta description from altText
- [x] Tests: 26 vitest tests

---

## Phase 8: Data Transforms, Edit History, CSV Download ✅

### Task N: Data Transforms (Session N) ✅
- [x] Backend: 8 transform endpoints in `api/routers/transforms.py` (transpose, rename, delete, reorder, round, prepend/append, edit-cell, cast-type)
- [x] Backend: 17 pytest tests (`api/tests/test_transforms.py`)
- [x] Frontend: 8 transform methods in `dataStore.ts`
- [x] Frontend: `DataTransformGrid.tsx` — editable grid with column header dropdowns, inline cell editing, transpose button
- [x] Frontend: Chart/Transform Data view toggle in EditorPage
- [x] Frontend: 10 vitest tests (`data-transforms.test.tsx`)

### Task O: Edit History / Versioning (Session O) ✅
- [x] Backend: `version_storage.py` — snapshot storage with auto-prune at 50 versions
- [x] Backend: `versions.py` router — 5 CRUD endpoints (create, list, get, restore, delete)
- [x] Backend: 14 pytest tests (`test_versions.py`)
- [x] Frontend: `VersionHistoryPanel.tsx` — version list with trigger badges, restore with confirmation
- [x] Frontend: Auto-save logic in `editorStore.ts` (30-save count, 60s idle timer, publish trigger, manual save)
- [x] Frontend: Save Version + History buttons, Republish label in EditorPage
- [x] Frontend: 8 vitest tests (`version-history.test.tsx`)

### Task P: CSV Download (Session P) ✅
- [x] Backend: `GET /api/v2/charts/{chart_id}/data.csv` endpoint (streams query result as CSV, respects allowDataDownload flag)
- [x] Backend: 6 pytest tests (`test_csv_download.py`)
- [x] Frontend: `allowDataDownload` toggle in Toolbox + `ChartConfig` type
- [x] Frontend: "Get the data" link in EmbedChartPage + PublicChartPage footer
- [x] Frontend: CSV button in ChartWrapper export row
- [x] Frontend: 6 vitest tests (`csv-download.test.tsx`)

---

## Bug Fix: Team Invite Email Silent Failure

### Root Cause
`teams.py:83,95` — `send_team_invite_email()` and `send_team_added_email()` return bool success/failure, but the invite endpoint ignores the return value and always reports success.

### Fix
- [x] Check email send return value in `invite_member()` endpoint
- [x] Log email send failures with `logging` module
- [x] Return 502 error to frontend when email fails (so user knows to retry)

---

## Test Summary (Phase 8 Complete)

| Suite | Count |
|-------|-------|
| Backend (pytest) | 200 |
| Frontend (vitest) | 571 |
| **Total** | **771** |
