/**
 * Chart types mirroring engine/models/chart.py
 */

// =============================================================================
// Enums
// =============================================================================

export type ChartType =
  | 'LineChart'
  | 'BarChart'
  | 'AreaChart'
  | 'ScatterPlot'
  | 'Histogram'
  | 'HeatMap'
  | 'BoxPlot'
  | 'PieChart'
  | 'Treemap'
  | 'DataTable'
  | 'BigValue'
  | 'DotPlot'
  | 'RangePlot'
  | 'BulletBar'
  | 'SmallMultiples'
  | 'ChoroplethMap'

// =============================================================================
// Annotation Types
// =============================================================================

export type AnnotationPosition = 'above' | 'below' | 'left' | 'right'

export interface ReferenceLine {
  id: string
  axis: 'x' | 'y'
  value: number | string
  label?: string
  color?: string
  strokeDash?: number[]
}

/** Point Note — anchored to a data point with a label offset from the dot. */
export interface PointAnnotation {
  id: string
  x: number | string
  y: number | string
  text: string
  /** @deprecated Use dx/dy. Kept for backward compat with saved JSON. */
  position?: AnnotationPosition
  dx?: number      // pixel offset from anchor dot
  dy?: number      // pixel offset from anchor dot
  dxRatio?: number  // proportional offset (0-1 of plot width) for responsive
  dyRatio?: number  // proportional offset (0-1 of plot height) for responsive
  fontSize?: number
  color?: string
}

/** @deprecated Use PointAnnotation instead */
export type TextAnnotation = PointAnnotation

export interface HighlightRange {
  id: string
  axis: 'x' | 'y'
  start: number | string
  end: number | string
  label?: string
  color?: string
  opacity?: number
}

export interface Annotations {
  lines: ReferenceLine[]
  /** Point notes (key kept as `texts` for backward compat with saved JSON) */
  texts: PointAnnotation[]
  ranges: HighlightRange[]
}

export type FilterType =
  | 'Dropdown'
  | 'DateRange'
  | 'TextInput'
  | 'ButtonGroup'
  | 'Slider'

// =============================================================================
// Filter Types
// =============================================================================

export interface FilterSpec {
  /** Unique filter name, becomes ${inputs.name} in SQL */
  name: string
  filterType: FilterType

  /** Label shown to user */
  title?: string

  /** For Dropdown/ButtonGroup: options configuration */
  optionsColumn?: string
  optionsTable?: string
  optionsQuery?: string
  optionsQueryName?: string

  /** For DateRange */
  dateColumn?: string
  defaultStart?: string
  defaultEnd?: string

  /** For Slider */
  minValue?: number
  maxValue?: number
  step?: number

  /** Default value for any filter type */
  defaultValue?: string
}

export interface FilterState {
  [filterName: string]: string | number | { start: string; end: string }
}

// =============================================================================
// Table Column Configuration
// =============================================================================

export type TableColumnType = 'text' | 'number' | 'heatmap' | 'bar' | 'sparkline'

export interface TableColumnConfig {
  /** Display type for this column */
  type?: TableColumnType
  /** Number format: 'currency' | 'percent' | 'compact' | 'number' */
  format?: string
  /** Text alignment override */
  align?: 'left' | 'center' | 'right'
  /** Heatmap color range [low, high] */
  heatmapColors?: [string, string]
  /** Bar fill color */
  barColor?: string
  /** Whether to apply conditional coloring (green positive / red negative) */
  conditional?: boolean
}

// =============================================================================
// Chart Configuration
// =============================================================================

export interface ChartConfig {
  /** Core data binding */
  x?: string
  y?: string | string[]
  y2?: string | string[]
  value?: string
  series?: string

  /** Formatting */
  xFmt?: string
  yFmt?: string
  valueFmt?: string
  /** Format hint for auto-formatting: 'currency', 'percent', 'number' */
  valueFormat?: 'currency' | 'percent' | 'number'

  /** Labels and titles */
  title?: string
  xAxisTitle?: string
  yAxisTitle?: string

  /** Styling */
  color?: string
  colorRange?: readonly string[]
  fillColor?: string
  backgroundColor?: string
  gridColor?: string

  /** Typography */
  titleFontSize?: number
  legendFontSize?: number
  axisFontSize?: number

  /** Display options */
  showLegend?: boolean
  showGrid?: boolean
  showValues?: boolean

  /** Line/scatter chart options */
  lineWidth?: number
  markerSize?: number

  /** Bar chart options */
  barGap?: number
  barGroupGap?: number

  /** Axis options */
  tickAngle?: number
  yAxisMin?: number
  yAxisMax?: number

  /** Chart-specific options */
  sort?: boolean | string
  horizontal?: boolean
  stacked?: boolean
  legendLabel?: string

  /** KPI/BigValue options */
  /** Column containing metric name labels for KPI grid mode */
  metricLabel?: string
  /** Column containing comparison value (e.g., previous period) */
  comparisonValue?: string
  /** Label for comparison (e.g., "vs last month") */
  comparisonLabel?: string
  /** Whether positive change is good (default: true) */
  positiveIsGood?: boolean
  /** Column containing unit strings (e.g. "USD", "percent", "count") for per-row formatting */
  unitColumn?: string
  /** Column(s) for sparkline data (time series) */
  sparklineX?: string
  sparklineY?: string
  /** Type of sparkline: 'line' or 'bar' */
  sparklineType?: 'line' | 'bar'
  /** Show trend indicator arrow */
  showTrend?: boolean

  /** Annotations */
  annotations?: Annotations

  /** Range plot: column containing min values */
  minColumn?: string
  /** Range plot: column containing max values */
  maxColumn?: string

  /** Bullet bar: column or static value for target marker */
  targetColumn?: string

  /** Small multiples: column to facet by */
  facetColumn?: string
  /** Small multiples: which mark type to repeat */
  chartSubtype?: 'line' | 'bar' | 'area' | 'scatter'

  /** Custom tooltip template (e.g. "{{ column | format }}") */
  tooltipTemplate?: string

  /** Rich Data Table: per-column configuration */
  tableColumns?: Record<string, TableColumnConfig>

  /** Choropleth map options */
  basemap?: string            // BasemapId: 'world' | 'us-states' | 'us-counties' | 'europe'
  geoJoinColumn?: string      // Data column to match against geography IDs
  geoValueColumn?: string     // Data column for choropleth coloring
  geoColorScale?: string      // 'sequential' | 'diverging'
  geoProjection?: string      // D3 projection name

  /** Per-chart locale override (empty string = use global locale) */
  locale?: string

  /** Data mode (used by editor) */
  dataMode?: 'table' | 'sql'

  /** Additional props */
  extraProps?: Record<string, unknown>
}

// =============================================================================
// Chart Spec (what LLM generates)
// =============================================================================

export interface ChartSpec {
  chartType: ChartType
  queryName: string
  sql: string
  config: ChartConfig
  filters?: FilterSpec[]
}

// =============================================================================
// Render Data (what API returns)
// =============================================================================

export interface ChartRenderData {
  /** The chart specification */
  spec: ChartSpec

  /** Executed query data as array of row objects */
  data: Record<string, unknown>[]

  /** Column names from the query */
  columns: string[]
}

// =============================================================================
// Chart Entity (stored in database)
// =============================================================================

export interface Chart {
  id: string
  title: string
  description: string
  queryName: string
  sql: string
  chartType: ChartType
  config: ChartConfig
  filters: FilterSpec[]
  createdAt: string
  updatedAt: string
  originalRequest: string
  isValid: boolean
  lastError?: string
}
