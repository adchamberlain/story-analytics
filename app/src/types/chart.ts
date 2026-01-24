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
  | 'BubbleChart'
  | 'Histogram'
  | 'FunnelChart'
  | 'SankeyDiagram'
  | 'Heatmap'
  | 'DataTable'
  | 'BigValue'

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

  /** Labels and titles */
  title?: string
  xAxisTitle?: string
  yAxisTitle?: string

  /** Styling */
  color?: string
  fillColor?: string

  /** Chart-specific options */
  sort?: boolean | string
  horizontal?: boolean
  stacked?: boolean

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

  /** Plotly-specific configuration */
  plotlyConfig?: {
    responsive?: boolean
    displayModeBar?: boolean | 'hover'
    displaylogo?: boolean
    modeBarButtonsToRemove?: string[]
  }
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
