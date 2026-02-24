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

## Common Mistakes
- (update as mistakes occur)
