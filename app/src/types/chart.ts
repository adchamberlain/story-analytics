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

// =============================================================================
// Annotation Types
// =============================================================================

export interface ReferenceLine {
  id: string
  axis: 'x' | 'y'
  value: number | string
  label?: string
  color?: string
  strokeDash?: number[]
}

export interface TextAnnotation {
  id: string
  x: number | string
  y: number | string
  text: string
  fontSize?: number
  color?: string
}

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
  texts: TextAnnotation[]
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
  /** Column containing comparison value (e.g., previous period) */
  comparisonValue?: string
  /** Label for comparison (e.g., "vs last month") */
  comparisonLabel?: string
  /** Whether positive change is good (default: true) */
  positiveIsGood?: boolean
  /** Column(s) for sparkline data (time series) */
  sparklineX?: string
  sparklineY?: string
  /** Type of sparkline: 'line' or 'bar' */
  sparklineType?: 'line' | 'bar'
  /** Show trend indicator arrow */
  showTrend?: boolean

  /** Annotations */
  annotations?: Annotations

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
