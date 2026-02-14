import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../../hooks/useObservablePlot'
import { plotDefaults, PRIMARY_COLOR, CHART_COLORS } from '../../themes/datawrapper'
import type { ChartConfig, ChartType } from '../../types/chart'

interface ObservableChartFactoryProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  chartType: ChartType
  height?: number
}

/**
 * Central chart renderer that maps ChartConfig + ChartType to Observable Plot marks.
 * Replaces the 17 Plotly chart components with a single unified component.
 */
export function ObservableChartFactory({
  data,
  config,
  chartType,
  height = 320,
}: ObservableChartFactoryProps) {
  const colors = config.color
    ? [config.color]
    : [...CHART_COLORS]

  const { containerRef } = useObservablePlot(
    (width) => {
      const marks = buildMarks(chartType, data, config, colors)
      const plotOptions = buildPlotOptions(chartType, config, colors, width, height)
      return Plot.plot({ ...plotOptions, marks })
    },
    [data, config, chartType, height]
  )

  // Non-Plot chart types
  if (chartType === 'BigValue') {
    return <BigValueChart data={data} config={config} />
  }

  if (chartType === 'DataTable') {
    return <DataTableChart data={data} config={config} />
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />
}

// ── Mark Builders ───────────────────────────────────────────────────────────

function buildMarks(
  chartType: ChartType,
  data: Record<string, unknown>[],
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  const x = config.x
  const y = config.y as string | undefined
  const series = config.series

  switch (chartType) {
    case 'LineChart':
      return buildLineMarks(data, x, y, series, config, colors)
    case 'BarChart':
      return buildBarMarks(data, x, y, series, config, colors)
    case 'AreaChart':
      return buildAreaMarks(data, x, y, series, config, colors)
    case 'ScatterPlot':
      return buildScatterMarks(data, x, y, series, config, colors)
    case 'Histogram':
      return buildHistogramMarks(data, x, config, colors)
    default:
      // Fallback: render as bar chart
      return buildBarMarks(data, x, y, series, config, colors)
  }
}

function buildLineMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const lineData = maybeParseDates(data, x)
  const marks: Plot.Markish[] = []

  if (series) {
    marks.push(
      Plot.lineY(lineData, {
        x, y,
        stroke: series,
        strokeWidth: config.lineWidth ?? 2,
      }),
      Plot.tip(lineData, Plot.pointerX({ x, y, stroke: series })),
    )
  } else {
    marks.push(
      Plot.lineY(lineData, {
        x, y,
        stroke: colors[0],
        strokeWidth: config.lineWidth ?? 2,
      }),
      Plot.tip(lineData, Plot.pointerX({ x, y })),
    )
  }

  return marks
}

function buildBarMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const marks: Plot.Markish[] = []

  if (config.horizontal) {
    // Horizontal bars: x is numeric, y is categorical
    const sortOpt = config.sort !== false
      ? { sort: { y: 'x' as const, reverse: true } }
      : {}

    if (series) {
      marks.push(
        Plot.barX(data, { x: y, y: x, fill: series, ...sortOpt }),
        Plot.tip(data, Plot.pointerY({ x: y, y: x, fill: series })),
      )
    } else {
      marks.push(
        Plot.barX(data, { x: y, y: x, fill: colors[0], ...sortOpt }),
        Plot.tip(data, Plot.pointerY({ x: y, y: x })),
      )
    }
  } else {
    // Vertical bars
    const sortOpt = config.sort !== false
      ? { sort: { x: '-y' as const } }
      : {}

    if (series) {
      marks.push(
        Plot.barY(data, {
          x, y,
          fill: series,
          ...(config.stacked ? {} : { fx: x }),
          ...sortOpt,
        }),
        Plot.tip(data, Plot.pointerX({ x, y, fill: series })),
      )
    } else {
      marks.push(
        Plot.barY(data, { x, y, fill: colors[0], ...sortOpt }),
        Plot.tip(data, Plot.pointerX({ x, y })),
      )
    }
  }

  return marks
}

function buildAreaMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const areaData = maybeParseDates(data, x)
  const fillColor = config.fillColor ?? `${colors[0]}26` // 15% opacity
  const marks: Plot.Markish[] = []

  if (series) {
    marks.push(
      Plot.areaY(areaData, { x, y, fill: series, fillOpacity: 0.15 }),
      Plot.lineY(areaData, { x, y, stroke: series, strokeWidth: config.lineWidth ?? 2 }),
      Plot.tip(areaData, Plot.pointerX({ x, y, stroke: series })),
    )
  } else {
    marks.push(
      Plot.areaY(areaData, { x, y, fill: fillColor }),
      Plot.lineY(areaData, { x, y, stroke: colors[0], strokeWidth: config.lineWidth ?? 2 }),
      Plot.tip(areaData, Plot.pointerX({ x, y })),
    )
  }

  return marks
}

function buildScatterMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const r = config.markerSize ?? 4
  const marks: Plot.Markish[] = []

  if (series) {
    marks.push(
      Plot.dot(data, { x, y, fill: series, r }),
      Plot.tip(data, Plot.pointer({ x, y, fill: series })),
    )
  } else {
    marks.push(
      Plot.dot(data, { x, y, fill: colors[0], r }),
      Plot.tip(data, Plot.pointer({ x, y })),
    )
  }

  return marks
}

function buildHistogramMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  _config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x) return []

  return [
    Plot.rectY(data, { ...Plot.binX({ y: 'count' }, { x }), fill: colors[0] as string }),
    Plot.tip(data, Plot.pointerX(Plot.binX({ y: 'count' }, { x }))),
  ]
}

// ── Plot Options Builder ────────────────────────────────────────────────────

function buildPlotOptions(
  _chartType: ChartType,
  config: ChartConfig,
  colors: readonly string[] | string[],
  width: number,
  height: number,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {}

  // Axis labels
  if (config.xAxisTitle || config.yAxisTitle) {
    if (config.xAxisTitle) overrides.x = { ...getBaseAxis(), label: config.xAxisTitle }
    if (config.yAxisTitle) overrides.y = { ...getBaseAxis(), label: config.yAxisTitle, grid: true }
  }

  // Y-axis bounds
  if (config.yAxisMin !== undefined || config.yAxisMax !== undefined) {
    const yOpts = (overrides.y as Record<string, unknown>) ?? { ...getBaseAxis(), grid: true }
    if (config.yAxisMin !== undefined) yOpts.domain = [config.yAxisMin, config.yAxisMax ?? undefined]
    overrides.y = yOpts
  }

  // Horizontal bars need wider left margin for labels
  if (config.horizontal) {
    overrides.marginLeft = 100
  }

  // Grid toggle
  if (config.showGrid === false) {
    overrides.grid = false
  }

  // Color range
  overrides.color = { range: [...colors] }

  return plotDefaults({
    width,
    height,
    ...overrides,
  })
}

function getBaseAxis() {
  return { line: true, tickSize: 0, labelOffset: 8 }
}

// ── Date Parsing Helper ─────────────────────────────────────────────────────

function maybeParseDates(
  data: Record<string, unknown>[],
  xField: string
): Record<string, unknown>[] {
  if (data.length === 0) return data

  const sample = data[0][xField]
  if (typeof sample === 'string' && /^\d{4}-\d{2}/.test(sample)) {
    return data.map((d) => ({ ...d, [xField]: new Date(d[xField] as string) }))
  }
  return data
}

// ── Non-Plot Chart Types ────────────────────────────────────────────────────

function BigValueChart({ data, config }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  if (data.length === 0) return null

  const row = data[0]
  const valueField = config.value ?? config.y
  const value = valueField ? row[valueField as string] : null
  const compValue = config.comparisonValue ? row[config.comparisonValue] : null

  let formattedValue = String(value ?? '—')
  if (typeof value === 'number') {
    if (config.valueFormat === 'currency') formattedValue = `$${value.toLocaleString()}`
    else if (config.valueFormat === 'percent') formattedValue = `${value.toFixed(1)}%`
    else formattedValue = value.toLocaleString()
  }

  const delta = (typeof value === 'number' && typeof compValue === 'number')
    ? value - compValue
    : null

  const positiveIsGood = config.positiveIsGood !== false

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      <div className="text-4xl font-bold" style={{ color: PRIMARY_COLOR }}>
        {formattedValue}
      </div>
      {delta !== null && (
        <div
          className="text-sm mt-2 font-medium"
          style={{
            color: (delta >= 0) === positiveIsGood ? '#4dac26' : '#d6604d',
          }}
        >
          {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
          {config.comparisonLabel && (
            <span className="text-gray-400 ml-1 font-normal">{config.comparisonLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

function DataTableChart({ data }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  if (data.length === 0) return <p className="text-sm text-gray-400">No data</p>

  const columns = Object.keys(data[0])

  return (
    <div className="overflow-auto max-h-80">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 border-b-2 border-gray-200 font-semibold"
                style={{ color: '#1a1a1a', fontSize: 12 }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 border-b border-gray-100" style={{ fontSize: 12 }}>
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
