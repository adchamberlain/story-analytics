# Datawrapper Parity — Progress Tracker

> **Design doc:** `docs/plans/2026-02-24-datawrapper-parity-design.md`
> **Implementation plan:** `docs/plans/2026-02-24-datawrapper-parity-plan.md`

## Current Phase: 0 — Autonomous Loop Infrastructure

### Task 0: Development Loop Setup
- [ ] Screenshot verification (Playwright)
- [ ] Backend stress test suite
- [ ] Frontend component test harness

## Phase 1: Embeddable & Publishable

### Task 1: Publish Workflow
- [ ] Backend: Add `status` field to chart/dashboard storage (`draft` | `published`)
- [ ] Backend: Publish/unpublish API endpoints
- [ ] Backend: Public chart endpoint (no auth, only serves published)
- [ ] Frontend: Publish button in editor
- [ ] Frontend: PublicChartPage (read-only, no editor chrome)
- [ ] Frontend: Route `/public/chart/:id`
- [ ] Tests: pytest for publish/unpublish flow
- [ ] Tests: Screenshot verify published view

### Task 2: Embed System
- [ ] Embed page route and component (`EmbedChartPage`)
- [ ] Separate Vite entry point for embed bundle (<100KB)
- [ ] Embed code generator in SharePanel (iframe snippet)
- [ ] PostMessage height auto-resize
- [ ] Privacy headers (no cookies, no tracking)
- [ ] Tests: Embed renders correctly
- [ ] Tests: Screenshot verify embed at desktop + mobile

### Task 3: Custom Tooltip Formatting
- [ ] Tooltip template parser (`{{ column | format }}`)
- [ ] Tooltip editor UI in Toolbox
- [ ] Observable Plot tooltip integration
- [ ] Tests: Template parsing unit tests
- [ ] Tests: Screenshot verify tooltips

### Task 4: Chart Type Expansion (11 → 15)
- [ ] Dot plot (Cleveland style)
- [ ] Range plot (min-max bars)
- [ ] Bullet bar (bar + target marker)
- [ ] Small multiples (Observable Plot faceting)
- [ ] Tests: Each new chart type renders with sample data
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

## Phase 3: Rich Tables & Data

### Task 9: Rich Data Tables
- [ ] RichDataTable component (replace DataTableChart)
- [ ] Column types: text, number, heatmap, bar, sparkline
- [ ] Click-to-sort headers
- [ ] Search bar (client-side filtering)
- [ ] Pagination (10/25/50/100 rows)
- [ ] Sticky header row
- [ ] Per-column formatting and conditional coloring
- [ ] Tests: Sort, search, pagination logic
- [ ] Tests: Screenshot with heatmap + sparkline columns

### Task 10: Google Sheets Connector
- [ ] Backend: Parse Sheets URL → extract sheet ID
- [ ] Backend: Fetch via public CSV export URL
- [ ] Backend: Configurable polling interval
- [ ] Frontend: GoogleSheetsInput component
- [ ] Tests: URL parsing, CSV fetch
- [ ] Tests: Auto-refresh on embed load

### Task 11: External URL Data Source
- [ ] Backend: Fetch CSV/JSON from any URL
- [ ] Backend: Optional HTTP headers for auth
- [ ] Backend: Cache with staleness indicator
- [ ] Frontend: UrlSourceInput component
- [ ] Tests: URL fetch, caching, stale indicator

### Task 12: Folders & Organization
- [ ] Backend: Folder storage service
- [ ] Backend: Folder CRUD API
- [ ] Frontend: Folder tree sidebar in library
- [ ] Frontend: Drag charts into folders
- [ ] Frontend: Search across all items
- [ ] Tests: Folder CRUD, chart-folder association

## Phase 4: Maps

### Task 13: Choropleth Maps
- [ ] ChoroplethMap component (D3-geo + TopoJSON)
- [ ] Basemaps: world countries, US states, US counties, Europe
- [ ] Data join: match column to geography ID
- [ ] Color scale: sequential + diverging
- [ ] Legend: gradient or stepped
- [ ] Tooltips: hover shows region + value
- [ ] Custom GeoJSON/TopoJSON upload
- [ ] Tests: Map renders with sample data
- [ ] Tests: Screenshot verify map at multiple projections

### Task 14: Responsive Annotations
- [ ] Store proportional positions alongside pixel positions
- [ ] Recalculate on resize
- [ ] Collapse to footnotes below 400px
- [ ] Tests: Resize behavior
- [ ] Tests: Screenshot at desktop vs mobile

### Task 15: Chart Templates & Duplication
- [ ] Backend: Duplicate chart endpoint
- [ ] Backend: Template storage
- [ ] Frontend: Duplicate action in library
- [ ] Frontend: Save as template
- [ ] Frontend: Template gallery in chart creation
- [ ] Tests: Duplicate preserves config, not data
