# Dev Log

## 2026-02-18

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
