# Datawrapper: Comprehensive Feature Breakdown

Research date: 2026-02-24

---

## 1. Chart Types (21+ types)

Datawrapper offers 21+ interactive, responsive, and accessible chart types, organized by what they communicate.

### Showing Developments Over Time
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Line Chart** | `d3-lines` | Shows change of one variable over time | Upload time-series data, Datawrapper auto-detects dates, renders clean line with hover values | Gold standard for trend communication; direct labeling reduces legend reliance |
| **Multiple Lines (Small Multiples)** | `multiple-lines` | One line per panel for many series | Each series gets its own mini-panel; avoids spaghetti-chart problem | Ideal for comparing 10+ time series without visual overload |
| **Area Chart** | `d3-area` | Shows internal breakdown changes over time (stacked areas) | Upload with category column; auto-stacks proportions | Shows both total and composition changes simultaneously |
| **Column Chart** | `column-chart` | Vertical bars for few time points | Works best with <15 categories; auto-labels values | Clean categorical comparison when you have discrete time points |
| **Stacked Column Chart** | `stacked-column-chart` | Columns split into sub-categories | Each column has proportional segments by category | Shows both total and share simultaneously |
| **Grouped Column Chart** | `grouped-column-chart` | Side-by-side columns per category | Groups appear naturally; good for 2-4 sub-categories | Direct sub-category comparison without stacking confusion |
| **Small Multiple Column Chart** | (new 2025) | Separate column panel per series | Each category gets its own panel; works for both time series and categorical data | Avoids grouped-column clutter for many categories |

### Showing Proportions/Shares
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Pie Chart** | `d3-pies` | Classic proportional circle | Upload category + value; auto-renders with labels | Universally understood; best limited to 3-5 slices |
| **Donut Chart** | `d3-donuts` | Pie with center hole | Same as pie but center can hold a total or label | Slightly more modern feel; center space for KPI |
| **Multiple Pies** | `d3-multiple-pies` | Small multiples of pie charts | Multiple proportional comparisons side-by-side | Compare composition across groups |
| **Multiple Donuts** | `d3-multiple-donuts` | Small multiples of donut charts | Same as multiple pies with donut styling | Compare compositions with central KPIs |
| **Election Donut** | `election-donut-chart` | Parliament/election-style hemicycle | Specialized layout for seat distributions | Purpose-built for political/election reporting |

### Showing Comparisons/Rankings
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Bar Chart** | `d3-bars` | Horizontal bars for ranking | Upload category + value; auto-sorts; direct labels | Best for ranked lists; readable labels without rotation |
| **Split Bars** | `d3-bars-split` | Mirrored bars (e.g., population pyramid) | Two value columns diverge from center | Perfect for demographic pyramids, survey agree/disagree |
| **Stacked Bars** | `d3-bars-stacked` | Horizontal stacked segments | Each bar shows composition | Survey results, Likert scales, budget breakdowns |
| **Bullet Bars** | `d3-bars-bullet` | Bar with target/reference marker | Shows actual vs. target in single bar | KPI tracking, goal vs. actual performance |
| **Dot Plot** | `d3-dot-plot` | Dots on a number line per category | Space-efficient; multiple dots per row possible | Compact multi-value comparison; great for survey data |
| **Range Plot** | `d3-range-plot` | Shows span between two values | Horizontal bar showing min-max range | Confidence intervals, salary ranges, before/after |
| **Arrow Plot** | `d3-arrow-plot` | Directional change arrows | Arrow shows direction + magnitude of change | Compact change visualization for many categories |

### Showing Correlations
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Scatter Plot** | `d3-scatter-plot` | X-Y dot plot with optional size/color | Upload x, y, (size), (color) columns; supports bubble chart mode | Core research tool for correlation/distribution analysis |

### Tables
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Table** | `tables` | Responsive data table with mini-charts | Rich formatting: heatmaps, sparklines, bar columns, images, search, sort, pagination | Combines raw data access with visual encoding |

### Maps
| Chart Type | API ID | What It Does | User Experience | Researcher Value |
|---|---|---|---|---|
| **Choropleth Map** | `d3-maps-choropleth` | Colors geographic regions by data values | Pick from 3000+ basemaps; upload data keyed to region names/codes | Standard geographic data visualization |
| **Symbol Map** | `d3-maps-symbols` | Sized/colored symbols at geographic points | Place symbols by lat/lon or place name | Point-data geographic visualization |
| **Locator Map** | `locator-map` | Marks where something is on a street-level map | Add points, areas, lines on OpenStreetMap tiles | Event/location storytelling |

### Chart Types Referenced in Guide But Not Natively Supported (Aspirational)
These are mentioned in Datawrapper's chart type guide as general visualization categories, but are NOT built into Datawrapper as native chart types:
- Stream Graph
- Slope Chart
- Waffle Chart / Multiple Waffle Charts
- Pictogram Chart
- Marimekko Chart
- Treemap
- Proportional Area Chart
- Alluvial / Sankey Diagram
- 2D Histogram / Heatmap (standalone -- but heatmap is available in tables)

---

## 2. Map Types (5 types)

### Choropleth Map
- **What it does**: Colors geographic regions (countries, states, ZIP codes, districts) based on data values
- **User experience**: Select from 3,000+ built-in basemaps or upload custom GeoJSON/TopoJSON (<2MB, WGS-84). Map auto-matches data to regions by name or code. User picks color scale (sequential, diverging, categorical). Interactive tooltips on hover
- **Researcher value**: The standard for geographic data; massive basemap library means no GIS skills needed; supports pattern overlays for layered data

### Symbol Map
- **What it does**: Places sized/colored geometric symbols (circles, etc.) at specific geographic coordinates
- **User experience**: Upload lat/lon data or geocode by place name. Size and color encode separate variables. Supports grouping/clustering with zoom. Same 3,000+ basemaps
- **Researcher value**: Point-data visualization without region boundaries; bubble maps for city-level data

### Spike Map
- **What it does**: Variant of symbol maps using vertical spikes instead of circles
- **User experience**: Same data input as symbol maps; spikes height encodes value
- **Researcher value**: Less visual occlusion than circles for dense point data

### Arrow Map
- **What it does**: Shows directional data/change with arrows at geographic points (also called "swing maps" or "hedgehog maps")
- **User experience**: Arrows encode both direction and magnitude; launched for U.S. election 2024
- **Researcher value**: Visualize shifts/changes (e.g., election swings, wind direction, migration)

### Locator Map
- **What it does**: Shows specific locations on a detailed street-level map with buildings, parks, terrain
- **User experience**: Based on OpenStreetMap tiles. Add point markers, area markers, line markers. Search for locations, import GeoJSON/KML/CSV. New globe projection (2025). New marker editor with grouping, multi-select, bulk editing
- **Researcher value**: Event mapping, field research locations, qualitative spatial storytelling

### Map Infrastructure
- **3,000+ basemaps**: Countries, states, municipalities, ZIP codes, election districts, cartograms, hexmaps
- **50+ cartogram/hexmap variants**
- **Custom basemap upload**: GeoJSON and TopoJSON (< 2MB, WGS-84)
- **Map projections**: Mercator (default for locator), Azimuthal Equal Area, Conic Equidistant, Conic Conformal, Albers (USA), Globe (new 2025)
- **Inset maps**: Automatically show geographic context when map is cropped
- **Hillshading**: Terrain visualization
- **3D buildings**: Map tilting for urban visualization
- **Custom map colors**: Streets, buildings, parks, forests, mountains, water bodies, regions

---

## 3. Table Types & Features

### Column Types
| Column Type | Description |
|---|---|
| Text | Standard text with custom formatting |
| Numbers | With locale-aware formatting |
| Heatmap | Background color scales based on value |
| Bar charts | Inline horizontal bars |
| Column charts | Inline vertical bar sparklines |
| Line charts (sparklines) | Inline trend lines |
| Images | Inline images in cells |
| Flags | Country flag icons replacing ISO codes |
| Category colors | Cells colored based on category values from another column |

### Interactivity
- **Search**: Full-text search with query string pre-fill support (`?search=Europe`)
- **Sorting**: Configurable per-column; reader-initiated column sorting
- **Pagination**: Configurable rows per page; "Show N more" button
- **Sticky rows**: Rows that persist regardless of search/scroll
- **Sticky first column**: For wide tables on narrow screens

### Styling
- Per-row and per-column formatting: font, color, background, alignment, borders
- Conditional formatting / category-based coloring
- Number and date format customization
- Custom themes applied to tables

### Responsive Behavior
- Tables adapt to screen width
- Mobile fallback display option
- Sticky first column for horizontal scroll on mobile
- Compact layout option for small screens

---

## 4. Data Input Methods

| Method | How It Works | Live Updates? |
|---|---|---|
| **Copy & Paste** | Paste tabular data directly into the editor from spreadsheets, websites, etc. | No |
| **File Upload** | Upload XLSX, XLS, ODS, CSV, TSV, TXT, DBF files; multi-sheet selection for Excel | No |
| **Google Sheets (Connect)** | Paste Google Sheet URL; data refreshes on each editor open | Manual refresh |
| **Google Sheets (Link External)** | Link via external dataset; Datawrapper server polls (every minute day 1, hourly for 29 days) | Yes, automatic |
| **External CSV URL** | Point to any publicly-accessible CSV; supports CORS, HTTPS | Yes, per page load |
| **API Upload** | PUT data to `charts/{id}/assets/{asset}` endpoint; typically CSV | Yes, scriptable |
| **GeoJSON/TopoJSON Upload** | For map data; WGS-84 coordinate system required | No |
| **KML Import** | For locator map markers | No |
| **Google Apps Script** | Automate CSV import into Google Sheet for pipeline chaining | Yes, scriptable |

### Data Transformation (Step 2)
- Transpose rows/columns
- Rearrange/delete columns
- Round numbers
- Divide/multiply values
- Prepend/append text (e.g., "$", "%")
- Auto-detect column types (text, number, date)

---

## 5. Customization Options

### Colors
- Custom categorical color palettes (unlimited colors, organized into groups)
- Sequential, diverging, and categorical gradient scales
- Color descriptions to guide team members
- Option to restrict teams to palette-only colors
- CMYK equivalents for print
- Dark mode color variants (auto-generated or manually specified)
- Per-element color overrides (background, text, gridlines, axes, etc.)

### Fonts
- Custom font families for every text element: titles, descriptions, axis labels, tooltips, sources, bylines, map labels
- Font weight, size, color, and style per element
- Font sources: self-hosted files, Adobe Fonts, Google Fonts

### Legends
- Position control (top, bottom, inline with chart)
- Size legends (for symbol maps)
- Color legends with interactive region highlighting (click legend entry to highlight)
- Stacked color legends (2024 feature)
- Custom legend titles

### Annotations (detailed in section 15 below)

### Layout
- Header: title, description, custom fields
- Footer: source, byline, notes, custom fields
- Logo placement with customizable size and positioning
- Multiple logo options per visualization
- Custom header/footer layouts with columns, shapes, images
- Figure numbers, copyright blocks, timestamps
- Output width control
- Plot height control (fixed or aspect-ratio based)

---

## 6. Responsive/Mobile Design

- **Width**: All visualizations are fully fluid-width; adapt smoothly from ~380px mobile to 700px+ desktop
- **Height**: Two modes for charts:
  - Fixed plot height (same on all screens)
  - Aspect-ratio-based (scales proportionally with width)
- **Height auto-adjustment**: Embedded JavaScript listens for iframe height messages, dynamically adjusts to prevent clipping or whitespace
- **Annotation responsiveness**: Text annotations and labels reflow for mobile; desktop/mobile-specific annotation visibility toggles
- **Tables**: Sticky first column, pagination, compact layout, mobile fallback
- **Maps**: Auto-zoom, responsive legend repositioning
- **Legend behavior**: Flexible legend placement on desktop vs. mobile (repositionable)

---

## 7. Embed Options

| Method | Description | JavaScript Required? |
|---|---|---|
| **Script embed (recommended)** | Web Component standard; responsive; auto-height | Yes |
| **Responsive iframe** | Works when Web Components not supported | Yes (helper script) |
| **Standard iframe** | Basic embed with fixed dimensions | No |
| **oEmbed** | WordPress plugin auto-generates embed from URL | No (plugin handles it) |
| **PowerPoint add-in** | Embed static or create/edit charts inside PowerPoint | N/A |
| **Static PNG fallback** | Auto-generated when JS disabled in browser | No |

### Render Flags (URL parameters or data attributes)
| Flag | Values | Effect |
|---|---|---|
| `dark` | `true`, `false`, `auto` | Force dark mode on/off or auto-detect |
| `plain` | `true`, `false` | Hide header/footer, show visualization only |
| `static` | `true`, `false` | Disable all interactive elements |
| `logo` | `on`, `off` | Show/hide custom theme logo |
| `logoId` | text | Select specific logo when multiple defined |
| `transparent` | `true`, `false` | Transparent background instead of theme background |
| `search` | text | Pre-fill table search box |

### Custom Embed Code
- Define custom embed code templates for CMS-specific requirements
- Add custom CSS classes, wrappers, processing attributes

---

## 8. Export Formats

| Format | Available On | Details |
|---|---|---|
| **PNG** | Free + all plans | Download from Step 4: Publish; configurable width/height; 3 auto-generated sizes (plain_s, plain, full) |
| **SVG** | Custom + Enterprise | Vector export; print-ready; configurable dimensions |
| **PDF** | Custom + Enterprise | Print-ready; configurable dimensions |
| **CSV data download** | All plans | "Get the data" link for readers to download underlying data |

### Image Publishing (Custom/Enterprise)
- Auto-generate PNG/SVG/PDF on every publish
- Define custom export formats (filename, size, filetype)
- Auto-publish to Amazon S3 bucket with custom domain
- Customizable image download filenames

---

## 9. Collaboration Features

### Workspaces (new 2025)
- Organizational container for all teams
- Single overview to view, edit, create teams
- Add/remove people across teams from one place

### Teams
- Shared visualization archive
- All team members can create, view, edit all team charts
- Shared folder structure
- Private workspace per user (inaccessible to others)
- Available on all plans (including free)

### Live Collaboration
- Real-time multi-user editing on same visualization
- Presence indicators (avatars showing who's editing)
- Edits immediately visible to all team members
- Free for all users on all plans

### Comments & Notifications
- Comment sidebar on every visualization
- Ask questions, give feedback, leave notes
- Reply to comments in threads
- Notifications in-app and via email
- Available on all plans

### Edit History
- Automatic version snapshots (every 30 edits, every publish, on chart type change, after 1 min idle)
- Preview any past version
- One-click restore to previous version
- Duplicate past version into new visualization
- Published versions highlighted

### Folders
- Folders and subfolders
- Mirror workflows (stages, clients, assignments)
- Move/copy visualizations between folders
- Team-shared and private folders

### Permissions
- Per-member permission settings
- Control who can change team settings
- Control who can invite new members
- Admin review of sign-in methods (SSO, 2FA, password)

### Trash
- 30-day retention for deleted visualizations
- One-click recovery

---

## 10. Theming/Branding (Custom/Enterprise)

### Color Palette
- Unlimited categorical colors organized into groups
- Unlimited gradient definitions
- Color descriptions to guide team choices
- Option to restrict teams to palette-only usage
- CMYK equivalents for print
- Dark mode color variants

### Typography
- Custom typeface, weight, size, color, style for every text element
- Titles, descriptions, axis labels, tooltips, sources, bylines, map labels
- Font sources: self-hosted, Adobe Fonts, Google Fonts

### Logo & Branding
- Logo placement with customizable size and positioning
- Multiple logo options per visualization
- Custom header/footer fields (subheads, copyright, figure numbers, timestamps)
- Configurable header/footer layouts with columns, shapes, images

### Map Theme
- Custom colors for streets, buildings, parks, forests, mountains, water, regions
- Custom fonts for map labels
- Custom marker symbols

### Governance
- Teams can decide which customization options colleagues can modify or disable
- Lock down non-guideline colors
- Control dark mode toggle visibility
- Control logo visibility options

### Process
- Datawrapper's support team builds custom themes during onboarding
- 1 custom theme included in Custom plan; additional themes at +$249/month

---

## 11. Localization

### Output Languages
- 50+ languages supported for visualization output
- Includes major languages: English (US, GB, CA, IE, AP, CH), German (DE, AT, CH), French, Spanish, Italian, Portuguese, Chinese (Simplified, Traditional), Japanese, Korean, Russian, Arabic, Hebrew, Persian, Hindi, and many more

### Number Formats
- Locale-aware decimal separators (period vs. comma)
- Locale-aware thousands separators (comma vs. period vs. space)
- Example: 1,000.00 (en-US) vs. 1.000,00 (de-DE) vs. 1 000,00 (de-CH)

### Date Formats
- Automatic month/weekday name translation (e.g., "April" -> "Aprile" in Italian, "四月" in Chinese)
- Locale-aware date ordering
- Custom date format tokens (M, MM, MMM, MMMM, etc.)

### Right-to-Left Language Support
- Full RTL support for Arabic (multiple locales), Persian, Hebrew
- Automatic reversal of: text alignment, x-axes, table columns, chart elements

### UI Element Translation
- Automatic translation of built-in interface text:
  - Locator map labels
  - Footer text ("Source", "Get the data", "Download image")
  - Table elements ("Search in table", "Page 1 of 5", "Show 10 more")

### Editor Languages
- Datawrapper application itself available in 6 languages: English, German, French, Italian, Spanish, Chinese

---

## 12. Accessibility

### Screen Readers
- Custom alternative text descriptions (set in Annotate tab)
- Auto-generated descriptions when no alt text provided (for some chart types)
- Chart body set to `aria-hidden`; alt text read instead
- Semantically correct, descriptive HTML markup following WCAG best practices

### Keyboard Navigation
- All chart/map/table elements navigable via keyboard only
- Tab, Shift+Tab, Enter key support
- Focus indicators for interactive elements

### Colorblind Safety
- Automatic colorblind check built into the editor
- Warning indicators when color palette may be indistinguishable
- Colorblind-safe palette recommendations (blue+orange as standard)

### Data Access
- "Get the data" CSV download link for readers
- Alternative to visual-only communication

### Embed Advantage
- Interactive HTML embeds over static images provide better screen reader support
- Semantic markup preserved in embeds

---

## 13. API

### Authentication
- Personal access tokens (created at app.datawrapper.de/account/api-tokens)
- Token scope management
- Server-side only (no browser-side API calls for security)
- Free for all users

### Chart/Map/Table Operations
| Operation | Endpoint Pattern | Notes |
|---|---|---|
| Create visualization | `POST /v3/charts` | Set type, title, metadata |
| Get visualization | `GET /v3/charts/{id}` | Full metadata |
| Update visualization | `PATCH /v3/charts/{id}` | Partial update |
| Delete visualization | `DELETE /v3/charts/{id}` | Soft delete |
| Restore visualization | `POST /v3/charts/{id}/restore` | Recover deleted |
| Upload data | `PUT /v3/charts/{id}/assets/{asset}` | Usually CSV |
| Get data | `GET /v3/charts/{id}/assets/{asset}` | Retrieve current data |
| Refresh external data | Triggers re-fetch from linked source | |
| Publish | `POST /v3/charts/{id}/publish` | Make live |
| Unpublish | `POST /v3/charts/{id}/unpublish` | Take offline |
| Duplicate | `POST /v3/charts/{id}/copy` | Clone chart |
| Fork | `POST /v3/charts/{id}/fork` | Fork from River |
| Export image | `GET /v3/charts/{id}/export/{format}` | PNG, SVG, PDF (sync + async) |
| Get share URLs | `GET /v3/charts/{id}/publish/status` | Embed codes |
| List charts | `GET /v3/charts` | With filters |
| Get/create comments | `GET/POST /v3/charts/{id}/comments` | |

### Folder Operations
- List, create, update, delete folders
- Move/copy folders

### User & Account
- Get/update account info
- Recently edited/published charts
- Manage user settings

### Workspace & Team Admin
- Create/manage workspaces
- Create/manage teams within workspaces
- Add/remove/modify member roles
- Send/manage invitations
- Merge workspaces
- Transfer teams between workspaces

### Other
- List available basemaps (with metadata and key values)
- List themes
- oEmbed endpoint
- River chart management
- Batch operations supported for charts, folders, team members

### Client Libraries
- **Python**: `datawrapper` package (official/community)
- **R**: `DatawRappr` package (community wrapper)
- **Node.js**: Direct REST API (Datawrapper's own backend is Node)

---

## 14. Live Data / Auto-Updates

### Methods (ranked by automation level)

1. **Link External Dataset (Datawrapper Server)**
   - Datawrapper polls your CSV URL at intervals
   - Day 1: every minute; Days 2-30: every hour
   - Republish resets the polling window
   - No reader-side action needed

2. **Link External Dataset (Direct Serve)**
   - Chart pulls CSV directly from your URL on every page load
   - Requires CORS, HTTPS, high-traffic capable hosting
   - Most real-time option

3. **Google Sheets Connection**
   - Data refreshes when editor opens or page reloads
   - Can share sheet privately with data@datawrapper.de
   - Does NOT auto-update in embed without "Link external dataset"

4. **API-Driven Updates**
   - Script uploads new data via API then publishes
   - Supports cron jobs, CI/CD pipelines, webhooks
   - Can update chart description with timestamp

5. **Google Apps Script**
   - Auto-import live CSV into Google Sheet
   - Chain with Google Sheets connection for end-to-end pipeline

---

## 15. Annotations

### Text Annotations
- Free drag-and-drop positioning anywhere on chart
- Rich text with HTML support (`<b>`, `<i>`, `<a>`, `<span>`, etc.)
- Arrows and circles pointing to specific elements
- Mobile-responsive reflow
- Desktop/mobile visibility toggles
- Available in: line, area, column, stacked column, bar, stacked bar, split bar, bullet bar, dot plot, range plot, arrow plot, scatter plot, maps

### Range Highlights
- Horizontal and vertical shaded regions
- Customizable color, opacity
- Drag to position directly on chart
- Use cases: confidence intervals, time periods, thresholds

### Line Highlights
- Horizontal and vertical reference lines
- Dashed or solid style
- Customizable width and color
- Use cases: averages, targets, thresholds, key dates

### Overlays (Bar/Column Charts)
- **Value overlay**: Line overlay showing comparison value (e.g., target vs. actual)
- **Range overlay**: Shaded area between two values (e.g., confidence interval)
- Click "Add overlay" in Refine tab

### Value Labels
- Automatic value labels on line charts with overlap-avoidance algorithm
- Direct labeling on bar/column charts
- Customizable number formatting

### Title/Description/Notes
- Title (with HTML support)
- Description (with HTML support)
- Notes (below chart, with HTML support)
- Source line
- Byline
- Alt text for accessibility

---

## 16. Tooltips

### Basic
- Enabled/disabled per visualization in Annotate tab
- Default: shows region/point name + value
- Available on: scatter plots, choropleth maps, symbol maps, locator maps

### Template Variables
- `{{ column_name }}` syntax to insert any data column
- Dynamic data interpolation

### Formatting Functions
| Function | Example | Purpose |
|---|---|---|
| `FORMAT()` | `{{ FORMAT(value, "0,0.[00]") }}` | Custom number formatting |
| `ROUND()` | `{{ ROUND(value, 2) }}` | Round to N decimals |
| `UPPER()` | `{{ UPPER(name) }}` | Uppercase text |
| `LOWER()` | `{{ LOWER(name) }}` | Lowercase text |
| `PROPER()` / `TITLE()` | `{{ TITLE(name) }}` | Title case |
| `CONCAT()` | `{{ CONCAT(first, " ", last) }}` | String concatenation |
| Math operators | `{{ a + b }}`, `{{ a * 100 / b }}` | Arithmetic in tooltips |
| `SIN()`, `SQRT()`, `LOG()` | Various | Math functions |

### Conditional Logic
- If-else: `{{ party == 'Democrats' ? 'Blue' : 'Red' }}`
- Numeric comparisons: `{{ value > 20 ? high_col : low_col }}`
- Nested conditions supported

### Rich HTML in Tooltips
- Extensive tag support: `<div>`, `<table>`, `<tr>`, `<td>`, `<img>`, `<a>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<li>`, `<figure>`, `<audio>`, `<meter>`, `<details>`, `<summary>`, and many more
- Create tables within tooltips
- Embed images
- Add hyperlinks
- Full CSS styling via `<span style="...">` and `<div style="...">`

### External Tooltips
- Tooltips that appear outside the chart bounds
- Useful for complex tooltip content

### Chart-in-Tooltip
- Embed mini Datawrapper charts inside tooltips
- Powerful for drill-down storytelling

---

## 17. Interactive Features

### Hover Interactions
- All charts: hover to see exact values
- Maps: hover for region/point tooltips
- Tables: row highlighting on hover

### Click Interactions
- Legend: click to highlight corresponding data
- Maps: click for sticky tooltips
- Tables: column header click to sort

### Search
- Tables: built-in search box with keyword filtering
- Pre-fillable via URL parameter (`?search=...`)

### Zoom
- Maps: scroll/pinch to zoom in/out
- Symbol maps: cluster/ungroup symbols on zoom

### Sorting
- Tables: configurable sortable columns
- Bar charts: auto-sort by value

### Pagination
- Tables: configurable rows per page
- "Show N more" progressive loading

### Tabs/Dropdown Workarounds (NOT native)
- Linked chart buttons via HTML in description
- Each button navigates to a different published chart within same iframe
- Query string filtering for tables
- Custom website-level UI wrapping multiple embeds
- **Philosophy**: Datawrapper favors author-driven, no-hidden-data design over explorer-driven interactivity

---

## 18. Publishing Workflow

### Create -> Publish Flow
1. **Upload Data** (Step 1)
2. **Check & Describe** (Step 2) - column types, transformations
3. **Visualize** (Step 3) - chart type, Refine, Annotate, Layout tabs
4. **Publish** (Step 4) - publish, get embed code, export

### States
- **Draft**: All visualizations start as drafts; editable anytime
- **Published**: Live at a unique URL; embeddable
- **Unpublished**: Removed from live; embed shows nothing

### Republishing
- Edit anytime after publishing
- Click "Republish" to push changes live
- Version number increments on every republish (e.g., `/ABCDE/3/`)
- All version URLs forward to latest version

### Edit History / Versioning
- Auto-saves every 30 edits, on publish, on chart type change, after 1 min idle
- Preview any past version
- Restore with one click
- Duplicate past version into new visualization
- Published versions highlighted in history

### Persistence
- Charts remain online even if subscription canceled
- Private by default

---

## 19. Custom CSS/HTML

### Supported HTML Tags (Titles, Descriptions, Notes)
`<a>`, `<span>`, `<b>`, `<br>`, `<i>`, `<strong>`, `<sup>`, `<sub>`, `<strike>`, `<u>`, `<em>`, `<tt>`, `<summary>`, `<details>`

### Supported HTML Tags (Tooltips)
Full set: `<a>`, `<abbr>`, `<address>`, `<audio>`, `<b>`, `<big>`, `<blockquote>`, `<br>`, `<caption>`, `<cite>`, `<code>`, `<col>`, `<colgroup>`, `<dd>`, `<del>`, `<details>`, `<dfn>`, `<div>`, `<dl>`, `<dt>`, `<em>`, `<figure>`, `<h1>`-`<h6>`, `<hr>`, `<hgroup>`, `<i>`, `<img>`, `<ins>`, `<kbd>`, `<li>`, `<mark>`, `<meter>`, `<ol>`, `<p>`, `<pre>`, `<q>`, `<s>`, `<small>`, `<span>`, `<strike>`, `<strong>`, `<sub>`, `<summary>`, `<sup>`, `<table>`, `<tbody>`, `<td>`, `<th>`, `<thead>`, `<tfoot>`, `<tr>`, `<tt>`, `<u>`, `<ul>`, `<wbr>`

### Inline CSS
- All inline CSS styles supported
- Applied via `style=""` attribute on supported tags
- Commonly used for button-like links, colored text, custom layouts

### Custom Embed Code
- Define custom embed code templates
- Add CSS classes, wrapper divs, CMS-specific attributes
- Useful for custom CMS integration

### Limitations
- No `<script>` tags (security)
- No external stylesheet loading
- No custom JavaScript injection in visualizations

---

## 20. River (Chart Sharing Platform)

**Note**: River is NOT an AI feature. It is a chart sharing/reuse platform.

### What It Is
- Public gallery of user-created Datawrapper charts at river.datawrapper.de
- Charts are shared by creators for others to reuse

### How It Works
1. Chart creators opt to add their visualizations to the River
2. Anyone can browse, search, and discover visualizations
3. Anyone can "re-use" a River chart (fork it into their own account)
4. Forked chart becomes fully editable with your own data

### Features
- **Favorites**: Curated collection of high-quality visualizations
- **Search**: Find charts by topic, type, keyword
- **Free**: All River features are free on all plans
- **API**: `GET /v3/river/charts` to list, retrieve, update River charts

### Researcher Value
- Starting templates for common visualization patterns
- See how others have visualized similar data
- Speed up chart creation by forking and editing

---

## 21. AI Features

As of February 2026, **Datawrapper has no AI features**. They have been deliberately conservative about AI integration. There are no:
- AI chart type recommendations
- AI data analysis
- Natural language chart creation
- AI-powered insights
- Auto-generated narratives

Datawrapper remains a manual, human-driven tool focused on craft and editorial control.

---

## 22. Pricing Tiers

### Free Plan ($0)
- Unlimited chart/map/table creation
- Unlimited publishes
- No view/impression limits
- PNG export
- All 21+ chart types
- All map types with 3,000+ basemaps
- Tables with all features
- Google Sheets connection
- API access (full)
- Live data connections
- Live collaboration
- Comments & notifications
- Edit history
- Teams & workspaces
- River access
- Dark mode
- Accessibility features
- All localizations
- **Includes** "Created with Datawrapper" attribution
- **1 user license**

### Custom Plan ($599/month or $5,990/year excl. VAT)
Everything in Free, plus:
- **No Datawrapper attribution**
- **SVG and PDF export** (in addition to PNG)
- **Print-ready graphics**
- **Custom fonts**
- **1 custom design theme** (additional at +$249/month)
- **10 user licenses** (additional at +$21/user/month)
- **Image Publishing** (auto-generate PNG/SVG/PDF on publish; push to S3)
- **Custom image download filenames**
- **Email support**
- **Priority support**

### Enterprise Plan (Custom pricing)
Everything in Custom, plus:
- **Self-hosting** of published charts/maps/tables (Amazon S3 + custom domain)
- **Single Sign-On (SSO)** via SAML2 or OpenID
- **SLA agreements**
- **Starting from 25 user licenses**
- **Dedicated support**

---

## 23. Privacy & Security

### Privacy
- GDPR compliant
- CCPA compliant
- Zero tracking on embedded visualizations
- No cookies on embedded visualizations
- No third-party scripts on embedded visualizations
- Data never sold to third parties
- Minimal data collection philosophy (since 2012 founding)

### Security
- ISO 27001 certified
- Annual audits against ISO 27001
- Yearly penetration testing by third-party specialists
- TLS encryption throughout
- Data encrypted in transit and at rest
- Least-privilege access principle
- All code undergoes peer review
- Automated and manual security testing before release

### Hosting
- AWS data centers: Frankfurt (primary) and Stockholm (backup)
- User data never leaves European Economic Area (EEA)
- Published visualizations distributed via global CDN
- Dual-datacenter disaster recovery
- Daily backups with matching encryption

### Authentication
- Two-factor authentication (2FA) -- launched 2024
- SSO via SAML2 or OpenID (Enterprise)
- Personal API access tokens with scope management

---

## 24. Additional Features & Details

### Dark Mode
- Automatic dark mode for all visualization types
- Algorithm auto-generates suitable colors for all elements
- Manual override: use same colors in dark mode if preferred
- Custom themes can define manual dark mode color variants
- Render flag: `?dark=true`, `?dark=false`, `?dark=auto`
- Available on all plans including free

### PowerPoint Integration
- Free official add-in for PowerPoint (Windows, Mac, Online)
- Browse and insert charts from your Datawrapper archive
- Create new visualizations directly in PowerPoint
- Edit existing visualizations within PowerPoint
- Static image insertion into slides

### WordPress Integration
- Datawrapper oEmbed plugin (free)
- Paste chart URL into WordPress editor; auto-embeds
- Works with all WordPress versions

### Number Formatting
- Custom format strings: `0,0.[00]`, `$0,0`, `0.0%`, etc.
- Prepend/append any text ("$", "%", "candies")
- Numbers retain numeric type even with prepend/append
- Locale-aware thousands and decimal separators
- Customizable in Step 2 (Check & Describe) and in tooltips

### Date Formatting
- Input recognition: wide variety of date formats
- Output tokens: M, MM, MMM, MMMM (and equivalents for day, year)
- Locale-aware month/weekday translation
- Custom date format strings

### Pattern Overlays (Choropleth Maps)
- Visual patterns layered on top of color-coded regions
- Encode a second variable alongside the color scale
- Launched 2024

### Cartograms & Hexmaps
- 50+ cartogram and hexagonal map variants
- Population-weighted or equal-area cartograms
- Available alongside standard basemaps

---

## Summary: What a $599/month Customer Gets Beyond Free

| Feature | Free | Custom ($599/mo) |
|---|---|---|
| Attribution | "Created with Datawrapper" | No attribution |
| Export | PNG only | PNG + SVG + PDF |
| Print-ready | No | Yes |
| Custom fonts | No | Yes |
| Custom theme | No | 1 included (+$249/mo each additional) |
| User licenses | 1 | 10 (+$21/mo each additional) |
| Image publishing (S3) | No | Yes |
| Custom image filenames | No | Yes |
| Priority support | No | Yes |
| Email support | No | Yes |

Note: An Enterprise customer (custom pricing, ~$800+/mo) additionally gets self-hosting, SSO, SLAs, and 25+ user licenses.
