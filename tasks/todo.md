# Datawrapper Parity — Progress Tracker

> **Design doc:** `docs/plans/2026-02-24-datawrapper-parity-design.md`
> **Implementation plan:** `docs/plans/2026-02-24-datawrapper-parity-plan.md`

## Current Phase: 4 — Maps

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
- [ ] Tests: Screenshot verify published view

### Task 2: Embed System ✅
- [x] Embed page route and component (`EmbedChartPage`)
- [ ] Separate Vite entry point for embed bundle (<100KB)
- [x] Embed code generator in SharePanel (iframe snippet)
- [x] PostMessage height auto-resize
- [ ] Privacy headers (no cookies, no tracking)
- [ ] Tests: Embed renders correctly
- [ ] Tests: Screenshot verify embed at desktop + mobile

### Task 3: Custom Tooltip Formatting ✅
- [x] Tooltip template parser (`{{ column | format }}`)
- [x] Tooltip editor UI in Toolbox
- [x] Observable Plot tooltip integration (wired through ChartConfig)
- [x] Tests: Template parsing unit tests (10 tests)
- [ ] Tests: Screenshot verify tooltips

### Task 4: Chart Type Expansion (11 → 15) ✅
- [x] Dot plot (Cleveland style)
- [x] Range plot (min-max bars)
- [x] Bullet bar (bar + target marker)
- [x] Small multiples (Observable Plot faceting with line/bar/area/scatter subtypes)
- [x] Tests: Type system + config field tests (10 tests)
- [ ] Tests: Screenshot verify each type

## Phase 2: Themeable & Localizable ✅

### Task 5: Theme Builder ✅
- [x] Backend: Theme storage service (JSON in `data/themes/`)
- [x] Backend: Theme CRUD API endpoints (9 tests)
- [x] Frontend: ThemeBuilderPage (`/settings/themes`)
- [x] Frontend: Color pickers for all theme properties
- [x] Frontend: Live preview (sample chart re-renders as theme changes)
- [x] Frontend: Import/export theme as JSON
- [x] Tests: Theme CRUD API tests (9 passing)
- [ ] Frontend: Font picker (Google Fonts + file upload) — future enhancement
- [ ] Frontend: Logo uploader with position control — future enhancement
- [ ] Frontend: Custom CSS override textarea — future enhancement
- [ ] Tests: Screenshot verify theme builder page

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
- [ ] Tests: Screenshot same chart in all 9 themes

### Task 7: Localization Engine ✅
- [x] Locale store (`localeStore.ts`) with 12 supported locales
- [x] Extend formatters.ts to accept locale parameter
- [x] Extend numberFormat.ts to accept locale parameter
- [x] Locale selector in Settings page with live preview
- [x] Tests: German, Japanese, French formatting (11 tests)
- [ ] Per-chart locale override option — future enhancement
- [ ] Tests: Screenshot with non-US locale

### Task 8: Color Tools ✅
- [x] Custom palette builder (add/remove/reorder colors)
- [x] Palette types: categorical (6), sequential (7), diverging (3)
- [x] Colorblind preview (protanopia/deuteranopia/tritanopia simulation)
- [x] Expand preset palettes (4 → 16: ColorBrewer, Tableau, DW defaults)
- [x] ColorblindPreview component with CVD type toggle
- [x] PaletteBuilder component with inline color editing
- [x] Tests: 17 colorblind simulation unit tests
- [ ] Tests: Screenshot palette builder UI

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
- [ ] Tests: Screenshot with heatmap + sparkline columns

### Task 10: Google Sheets Connector ✅
- [x] Backend: Parse Sheets URL → extract sheet ID
- [x] Backend: Fetch via public CSV export URL
- [ ] Backend: Configurable polling interval — future enhancement
- [x] Frontend: GoogleSheetsInput component
- [x] Tests: URL parsing, CSV fetch (11 tests)
- [ ] Tests: Auto-refresh on embed load — future enhancement

### Task 11: External URL Data Source ✅
- [x] Backend: Fetch CSV/JSON from any URL
- [x] Backend: Optional HTTP headers for auth
- [ ] Backend: Cache with staleness indicator — future enhancement
- [x] Frontend: UrlSourceInput component
- [x] Tests: URL fetch, validation (5 tests)

### Task 12: Folders & Organization ✅
- [x] Backend: Folder storage service
- [x] Backend: Folder CRUD API
- [x] Frontend: Folder tree sidebar in library
- [x] Frontend: Move-to-folder dropdown on chart cards
- [x] Frontend: Search across all items
- [x] Tests: Folder CRUD, chart-folder association (11 tests)
- [ ] Frontend: Drag-and-drop charts into folders — future enhancement

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
- [ ] Custom GeoJSON/TopoJSON upload — future enhancement
- [ ] Tests: Screenshot verify map at multiple projections

### Task 14: Responsive Annotations ✅
- [x] Store proportional positions (dxRatio/dyRatio) alongside pixel positions
- [x] Recalculate on resize via resolveResponsiveOffset()
- [x] Collapse to footnotes below 400px via shouldCollapseAnnotations()
- [x] Tests: 7 unit tests (responsive offsets, ratio computation, collapse threshold)
- [ ] Tests: Screenshot at desktop vs mobile

### Task 15: Chart Templates & Duplication ✅
- [x] Backend: Duplicate chart endpoint (POST /v2/charts/{id}/duplicate)
- [x] Backend: Template storage service (template_storage.py)
- [x] Backend: Template CRUD API (templates.py router)
- [x] Backend: Save-as-template endpoint (POST /v2/charts/{id}/save-as-template)
- [x] Frontend: Duplicate action in library (Duplicate button on ChartCard)
- [x] Frontend: Save as template (Template button in EditorPage header)
- [x] Tests: 14 backend tests (duplication, template CRUD, save-as-template)
- [ ] Frontend: Template gallery in chart creation — future enhancement
