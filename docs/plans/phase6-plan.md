# Phase 6 — Final Datawrapper Parity + Screenshot Verification

> **Status:** In Progress
> **Sessions:** F (screenshots), G (map types), H (PPTX + dark mode), I (API docs + keys), J (collaboration)
> **Merge order:** F, G, H, I (parallel) → J (depends on I)

## Session F: Screenshot Verification (8 Deferred Tests)

**File:** `app/e2e/screenshots-deferred.spec.ts`

8 Playwright tests covering: published view, tooltips, theme builder, non-US locale, palette builder, rich table heatmap+sparkline, map projections, responsive annotations.

## Session G: New Map Types (Symbol, Locator, Spike)

**Task 6.2:** Extract `useGeoMap` hook from ChoroplethMap (basemap loading, projection, zoom/pan, SVG management)
**Task 6.3:** Create `GeoPointMap.tsx` with `mapVariant` prop (`symbol | locator | spike`). Register 3 new chart types across 7 files.

## Session H: PowerPoint Export + Dark Mode Embeds

**Task 6.4:** Install `pptxgenjs`, add `exportPPTX()` to chartExport.ts, add PPTX button to ChartWrapper
**Task 6.5:** Add `?theme=dark|light|auto` to embed pages, `prefers-color-scheme` listener, PostMessage override

## Session I: API Documentation + API Keys

**Task 6.6:** Enrich OpenAPI metadata on all routers (docstrings, Field examples, tags)
**Task 6.7:** API key system: `api_keys` table, key service, CRUD router, auth integration, SettingsPage UI

## Session J: Collaboration (Comments, Teams, Notifications)

**Task 6.8:** Comments: `comments` table, threaded display, @mentions, editor sidebar
**Task 6.9:** Teams: `teams`/`team_members` tables, CRUD, SettingsPage management
**Task 6.10:** Notifications: `notifications` table, bell icon in TopNav, polling

## Test Estimate

| Session | Backend | Frontend | E2E |
|---------|---------|----------|-----|
| F | 0 | 0 | 8 |
| G | 0 | ~10 | 0 |
| H | 0 | ~9 | 0 |
| I | ~11 | ~3 | 0 |
| J | ~24 | ~12 | 0 |
| **Total new** | **~35** | **~34** | **8** |
