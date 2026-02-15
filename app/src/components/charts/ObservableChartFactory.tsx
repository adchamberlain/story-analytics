import { useRef, useEffect } from 'react'
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { useObservablePlot } from '../../hooks/useObservablePlot'
import { plotDefaults, CHART_COLORS } from '../../themes/datawrapper'
import { useThemeStore } from '../../stores/themeStore'
import type { ChartConfig, ChartType, Annotations } from '../../types/chart'

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
  const resolved = useThemeStore((s) => s.resolved)
  const colors = config.color
    ? [config.color]
    : [...CHART_COLORS]

  const { containerRef } = useObservablePlot(
    (width) => {
      const marks = buildMarks(chartType, data, config, colors)
      const annotationMarks = buildAnnotationMarks(config.annotations)
      const plotOptions = buildPlotOptions(chartType, data, config, colors, width, height)
      return Plot.plot({ ...plotOptions, marks: [...marks, ...annotationMarks] })
    },
    [data, config, chartType, height, resolved]
  )

  // Non-Plot chart types
  if (chartType === 'BigValue') {
    return <BigValueChart data={data} config={config} />
  }

  if (chartType === 'DataTable') {
    return <DataTableChart data={data} config={config} />
  }

  if (chartType === 'PieChart') {
    return <PieChartComponent data={data} config={config} height={height} />
  }

  if (chartType === 'Treemap') {
    return <TreemapComponent data={data} config={config} height={height} />
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
    case 'HeatMap':
      return buildHeatMapMarks(data, x, y, series, colors)
    case 'BoxPlot':
      return buildBoxPlotMarks(data, x, y, colors)
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

function buildHeatMapMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  _colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []
  const fill = series ?? y
  return [
    Plot.cell(data, { x, y: series ? series : x, fill, tip: true }),
  ]
}

function buildBoxPlotMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []
  return [
    Plot.boxY(data, { x, y, fill: colors[0] }),
  ]
}

// ── Annotation Mark Builders ────────────────────────────────────────────────

function buildAnnotationMarks(annotations?: Annotations): Plot.Markish[] {
  if (!annotations) return []

  const marks: Plot.Markish[] = []

  // Reference lines
  for (const line of annotations.lines) {
    const color = line.color ?? '#e45756'
    const strokeDash = line.strokeDash ?? [6, 4]

    if (line.axis === 'x') {
      // Try to parse as date if it looks like an ISO date
      const val = typeof line.value === 'string' && /^\d{4}-\d{2}/.test(line.value)
        ? new Date(line.value)
        : line.value
      marks.push(
        Plot.ruleX([val], { stroke: color, strokeDasharray: strokeDash.join(','), strokeWidth: 1.5 })
      )
      if (line.label) {
        marks.push(
          Plot.text([{ x: val, label: line.label }], {
            x: 'x', text: 'label',
            dy: -8, fontSize: 11, fill: color, fontWeight: 600,
            frameAnchor: 'top',
          })
        )
      }
    } else {
      marks.push(
        Plot.ruleY([line.value], { stroke: color, strokeDasharray: strokeDash.join(','), strokeWidth: 1.5 })
      )
      if (line.label) {
        marks.push(
          Plot.text([{ y: line.value, label: line.label }], {
            y: 'y', text: 'label',
            dx: 4, fontSize: 11, fill: color, fontWeight: 600,
            textAnchor: 'start', frameAnchor: 'right',
          })
        )
      }
    }
  }

  // Highlight ranges
  for (const range of annotations.ranges) {
    const color = range.color ?? '#e45756'
    const opacity = range.opacity ?? 0.1

    if (range.axis === 'x') {
      marks.push(
        Plot.rectX([{ x1: range.start, x2: range.end }], {
          x1: 'x1', x2: 'x2',
          fill: color, fillOpacity: opacity,
        })
      )
      if (range.label) {
        marks.push(
          Plot.text([{ x: range.start, label: range.label }], {
            x: 'x', text: 'label',
            dy: -8, fontSize: 10, fill: color, fontWeight: 600,
            frameAnchor: 'top', textAnchor: 'start',
          })
        )
      }
    } else {
      marks.push(
        Plot.rectY([{ y1: range.start, y2: range.end }], {
          y1: 'y1', y2: 'y2',
          fill: color, fillOpacity: opacity,
        })
      )
      if (range.label) {
        marks.push(
          Plot.text([{ y: range.start, label: range.label }], {
            y: 'y', text: 'label',
            dx: 4, fontSize: 10, fill: color, fontWeight: 600,
            textAnchor: 'start', frameAnchor: 'left',
          })
        )
      }
    }
  }

  // Text annotations
  for (const ann of annotations.texts) {
    const color = ann.color ?? '#333'
    const fontSize = ann.fontSize ?? 12

    // Parse x as date if it looks like ISO
    const xVal = typeof ann.x === 'string' && /^\d{4}-\d{2}/.test(ann.x)
      ? new Date(ann.x)
      : ann.x

    marks.push(
      Plot.text([{ x: xVal, y: ann.y, label: ann.text }], {
        x: 'x', y: 'y', text: 'label',
        fontSize, fill: color, fontWeight: 500,
      })
    )
  }

  return marks
}

// ── Plot Options Builder ────────────────────────────────────────────────────

function buildPlotOptions(
  _chartType: ChartType,
  data: Record<string, unknown>[],
  config: ChartConfig,
  colors: readonly string[] | string[],
  width: number,
  height: number,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {}

  // Preserve data ordering for ordinal (string) x-axis values.
  // Observable Plot sorts ordinal domains alphabetically by default,
  // which breaks chronological or custom SQL ORDER BY.
  if (config.x && data.length > 0) {
    const sample = data[0][config.x]
    if (typeof sample === 'string' && !/^\d{4}-\d{2}/.test(sample)) {
      const seen = new Set<string>()
      const domain: string[] = []
      for (const row of data) {
        const v = row[config.x] as string
        if (!seen.has(v)) { seen.add(v); domain.push(v) }
      }
      overrides.x = { ...getBaseAxis(), domain }
    }
  }

  // Axis labels
  if (config.xAxisTitle || config.yAxisTitle) {
    if (config.xAxisTitle) overrides.x = { ...(overrides.x as Record<string, unknown> ?? {}), ...getBaseAxis(), label: config.xAxisTitle }
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

  // Color range + legend when series is in use
  overrides.color = { range: [...colors], ...(config.series ? { legend: true } : {}) }

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
      <div className="text-4xl font-bold text-chart-blue">
        {formattedValue}
      </div>
      {delta !== null && (
        <div
          className={`text-sm mt-2 font-medium ${
            (delta >= 0) === positiveIsGood ? 'text-chart-green' : 'text-chart-red'
          }`}
        >
          {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
          {config.comparisonLabel && (
            <span className="text-text-muted ml-1 font-normal">{config.comparisonLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

function PieChartComponent({ data, config, height }: { data: Record<string, unknown>[]; config: ChartConfig; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resolved = useThemeStore((s) => s.resolved)

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    const el = containerRef.current
    el.innerHTML = ''

    const labelField = config.x ?? Object.keys(data[0])[0]
    const valueField = (config.value ?? config.y ?? Object.keys(data[0])[1]) as string
    const width = el.clientWidth
    const size = Math.min(width, height)
    const radius = size / 2 - 20

    const pieData = data.map((d) => ({
      label: String(d[labelField] ?? ''),
      value: Number(d[valueField] ?? 0),
    })).filter((d) => d.value > 0)

    const colors = config.color ? [config.color] : [...CHART_COLORS]
    const colorScale = d3.scaleOrdinal(colors)

    const pie = d3.pie<{ label: string; value: number }>().value((d) => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(radius * 0.4) // Donut
      .outerRadius(radius)

    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', size)
      .attr('viewBox', `0 0 ${width} ${size}`)

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${size / 2})`)

    g.selectAll('path')
      .data(pie(pieData))
      .join('path')
      .attr('d', arc as never)
      .attr('fill', (_, i) => colorScale(String(i)))
      .attr('stroke', resolved === 'dark' ? '#1e293b' : '#fff')
      .attr('stroke-width', 2)

    // Labels
    const labelArc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(radius * 0.75)
      .outerRadius(radius * 0.75)

    g.selectAll('text')
      .data(pie(pieData))
      .join('text')
      .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', resolved === 'dark' ? '#e2e8f0' : '#374151')
      .text((d) => d.data.value > 0 ? d.data.label : '')

    return () => { el.innerHTML = '' }
  }, [data, config, height, resolved])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function TreemapComponent({ data, config, height }: { data: Record<string, unknown>[]; config: ChartConfig; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resolved = useThemeStore((s) => s.resolved)

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    const el = containerRef.current
    el.innerHTML = ''

    const labelField = config.x ?? Object.keys(data[0])[0]
    const valueField = (config.value ?? config.y ?? Object.keys(data[0])[1]) as string
    const width = el.clientWidth

    const treeData = data.map((d) => ({
      name: String(d[labelField] ?? ''),
      value: Math.abs(Number(d[valueField] ?? 0)),
    })).filter((d) => d.value > 0)

    interface TreeNode { name: string; value: number; children?: TreeNode[] }
    const rootData: TreeNode = { name: 'root', value: 0, children: treeData }
    const root = d3.hierarchy(rootData).sum((d) => d.value)

    d3.treemap<TreeNode>().size([width, height]).padding(2)(root)

    const colors = config.color ? [config.color] : [...CHART_COLORS]
    const colorScale = d3.scaleOrdinal(colors)

    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', height)

    type TreeLeaf = d3.HierarchyRectangularNode<TreeNode>
    const nodes = root.leaves() as TreeLeaf[]

    svg.selectAll('rect')
      .data(nodes)
      .join('rect')
      .attr('x', (d) => d.x0)
      .attr('y', (d) => d.y0)
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (_, i) => colorScale(String(i)))
      .attr('rx', 2)

    svg.selectAll('text')
      .data(nodes)
      .join('text')
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + 14)
      .attr('font-size', 11)
      .attr('fill', resolved === 'dark' ? '#e2e8f0' : '#fff')
      .text((d) => (d.x1 - d.x0) > 40 ? d.data.name : '')

    return () => { el.innerHTML = '' }
  }, [data, config, height, resolved])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function DataTableChart({ data }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>

  const columns = Object.keys(data[0])

  return (
    <div className="overflow-auto max-h-80">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 border-b-2 border-border-default font-semibold text-text-primary text-xs"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}>
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 border-b border-border-subtle" style={{ fontSize: 12 }}>
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
