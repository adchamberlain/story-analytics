import { useRef, useEffect, useCallback, useState } from 'react'
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { useObservablePlot } from '../../hooks/useObservablePlot'
import { plotDefaults } from '../../themes/plotTheme'
import { useThemeStore } from '../../stores/themeStore'
import { useChartThemeStore } from '../../stores/chartThemeStore'
import { useEditorStore } from '../../stores/editorStore'
import { getXValues, getYForX, resolveResponsiveOffset, computeRatios, smartOffset, shouldCollapseAnnotations } from '../../utils/annotationDefaults'
import type { ChartConfig, ChartType, Annotations, PointAnnotation, HighlightRange } from '../../types/chart'
import type { ChartTheme } from '../../themes/chartThemes'
import { shouldShowGrid, formatBigValue, computePctDelta, formatDelta } from './bigValueHelpers'
import { renderTooltip } from '../../utils/tooltipTemplate'
import { RichDataTable } from './table/RichDataTable'
import { ChoroplethMap } from './ChoroplethMap'
import { GeoPointMap } from './GeoPointMap'
import { ElectionDonut } from './ElectionDonut'
import { MultiplePies } from './MultiplePies'

/** Minimal type for the Observable Plot element with scale access. */
interface PlotElement extends HTMLElement {
  scale: (name: string) => { apply: (v: unknown) => number; domain?: unknown[]; range?: unknown[]; invert?: (px: number) => unknown }
}

interface ObservableChartFactoryProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  chartType: ChartType
  height?: number
  /** When true, use CSS flex layout to determine chart height from the container. */
  autoHeight?: boolean
  /** When true, point note labels are draggable (editor only). */
  editable?: boolean
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
  autoHeight = false,
  editable = false,
}: ObservableChartFactoryProps) {
  const resolved = useThemeStore((s) => s.resolved)
  const chartTheme = useChartThemeStore((s) => s.theme)
  const placingId = useEditorStore((s) => s.placingAnnotationId)
  const colors = config.colorRange
    ? [...config.colorRange]
    : config.color
      ? [config.color]
      : [...chartTheme.palette.colors]

  // HeatMap: auto-bin numeric axes with >20 distinct values into ~10 clean ranges
  const effectiveData = chartType === 'HeatMap' ? preprocessHeatmapData(data, config) : data

  // Build custom legend data — unique series values mapped to palette colors.
  // We never rely on Observable Plot's built-in legend (unreliable for stroke marks).
  const showLegend = config.showLegend !== false && !!config.series && chartType !== 'HeatMap'
  const legendItems = showLegend
    ? getUniqueSeries(effectiveData, config.series!, config).map((label, i) => ({
        label,
        color: colors[i % colors.length],
      }))
    : []

  // HeatMap: gradient legend showing the sequential color scale
  const heatmapLegend = chartType === 'HeatMap' && config.showLegend !== false && config.y ? (() => {
    const yCol = Array.isArray(config.y) ? config.y[0] : config.y
    if (!yCol) return null
    // Use __heatFill for the numeric range when y was binned into labels
    const fillCol = effectiveData.length > 0 && HEAT_FILL in effectiveData[0] ? HEAT_FILL : yCol
    const vals = effectiveData.map((d) => Number(d[fillCol])).filter((v) => isFinite(v))
    if (vals.length === 0) return null
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    return { lo, hi }
  })() : null

  // ArrowPlot / RangePlot: custom legend for start (hollow) vs end (filled) dots
  const showStartEndLegend = (chartType === 'ArrowPlot' || chartType === 'RangePlot') && legendItems.length === 0

  // Ref to the Observable Plot element — used for scale inversion on click-to-place
  const plotRef = useRef<PlotElement | null>(null)

  // Track container width for responsive annotation collapse
  const [chartWidth, setChartWidth] = useState(0)

  const { containerRef } = useObservablePlot(
    (width, measuredHeight) => {
      const plotHeight = autoHeight ? measuredHeight : height
      if (plotHeight <= 0) return null // waiting for flex layout to resolve
      setChartWidth(width)
      const collapsed = shouldCollapseAnnotations(width)

      // Coerce numeric series values to strings so both marks and plot options
      // use the same categorical (ordinal) values for the color scale.
      const series = config.series
      const chartData = (series && effectiveData.length > 0 && typeof effectiveData[0][series] === 'number')
        ? effectiveData.map((d) => ({ ...d, [series]: String(d[series]) }))
        : effectiveData

      const marks = buildMarks(chartType, chartData, config, colors, chartTheme)
      // Use chart theme colors for annotations when available, falling back to CSS vars.
      // This ensures annotations look correct in dark mode with themed cards (e.g. Economist).
      const bgColor = chartTheme.plot.background || chartTheme.card.background || 'var(--color-surface-raised, #1e293b)'
      const textColor = chartTheme.font.notes?.color || chartTheme.font.axis?.color || 'var(--color-text-primary, #e2e8f0)'
      const annotationMarks = buildAnnotationMarks(config.annotations, bgColor, textColor, chartTheme)
      const plotOptions = buildPlotOptions(chartType, chartData, config, colors, width, plotHeight, chartTheme)
      const plot = Plot.plot({ ...plotOptions, marks: [...marks, ...annotationMarks] })

      // Store plot ref for scale inversion in click handler
      plotRef.current = plot as unknown as PlotElement

      // Strip any built-in legend that Observable Plot may have generated
      if (plot.tagName === 'FIGURE') {
        for (const child of Array.from(plot.children)) {
          if (child.tagName !== 'svg' && child.tagName !== 'SVG' && child.tagName !== 'STYLE') {
            child.remove()
          }
        }
      }

      // Append annotation SVG layers (outside Plot marks, for pixel-space control + drag)
      const plotEl = plot as unknown as PlotElement
      const svg = plot.querySelector('svg') ?? (plot.tagName === 'svg' ? plot : null)

      // Apply crispEdges to gridlines for sharp pixel-aligned rendering
      if (svg) {
        svg.querySelectorAll('line').forEach((el) => {
          el.setAttribute('shape-rendering', 'crispEdges')
        })
      }

      // Highlight ranges first (renders behind point notes in z-order)
      // Skip SVG annotations when collapsed (< 400px) — they become footnotes instead
      if (!collapsed && svg && config.annotations?.ranges?.length) {
        appendHighlightRanges({
          svg: svg as SVGSVGElement,
          plotEl,
          ranges: config.annotations.ranges,
          data,
          xColumn: config.x,
          editable,
          onRangeEdgeDrag: (id, patch) => {
            const store = useEditorStore.getState()
            const anns = store.config.annotations
            store.updateConfig({
              annotations: {
                ...anns,
                ranges: (anns?.ranges ?? []).map((r) => r.id === id ? { ...r, ...patch } : r),
              },
            })
          },
        })
      }

      // Y-axis label (rendered manually to avoid overlap with tick values)
      if (svg && config.yAxisTitle) {
        appendYAxisLabel(svg as SVGSVGElement, plotEl, config.yAxisTitle)
      }

      // Point notes on top
      if (!collapsed && svg && config.annotations?.texts?.length) {
        appendPointNotes({
          svg: svg as SVGSVGElement,
          plotEl,
          annotations: config.annotations.texts,
          bgColor,
          textColor,
          fontFamily: chartTheme.font.family || 'Inter, system-ui, sans-serif',
          fontWeight: chartTheme.font.notes?.weight ?? 600,
          fontStyle: chartTheme.font.notes?.italic ? 'italic' : 'normal',
          editable,
          onDragEnd: (id, dx, dy, dxRatio, dyRatio) => {
            const store = useEditorStore.getState()
            const anns = store.config.annotations
            store.updateConfig({
              annotations: {
                ...anns,
                texts: (anns?.texts ?? []).map((t) =>
                  t.id === id ? { ...t, dx, dy, dxRatio, dyRatio, position: undefined } : t
                ),
              },
            })
          },
        })
      }

      return plot
    },
    [data, config, chartType, height, autoHeight, resolved, editable, chartTheme]
  )

  // ── Click-to-place handler ─────────────────────────────────────────────────
  const handleChartClick = useCallback((e: React.MouseEvent) => {
    const store = useEditorStore.getState()
    const activeId = store.placingAnnotationId
    if (!activeId || !plotRef.current) return

    const xCol = config.x
    if (!xCol || data.length === 0) return

    // Get click position relative to the SVG element
    const svg = plotRef.current.querySelector('svg') ?? plotRef.current
    const rect = svg.getBoundingClientRect()
    const px = e.clientX - rect.left

    // Use plot x-scale to find the nearest data x-value
    const xScale = plotRef.current.scale('x')
    const xValues = getXValues(data, xCol)

    let closestX: unknown = xValues[0]
    let minDist = Infinity
    for (const v of xValues) {
      // Parse dates for scale application (same logic as maybeParseDates)
      const scaled = typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? new Date(v) : v
      const xPx = xScale.apply(scaled)
      const dist = Math.abs(px - xPx)
      if (dist < minDist) {
        minDist = dist
        closestX = v
      }
    }

    // Look up y from data
    const yCol = config.y as string | undefined
    const yVal = yCol ? getYForX(data, xCol, yCol, closestX) ?? 0 : 0

    // Compute smart dx/dy offset that won't clip off-screen
    const ctx = {
      data,
      xColumn: xCol,
      yColumn: yCol,
      columnTypes: useEditorStore.getState().columnTypes,
    }
    const offset = smartOffset(ctx, closestX, yVal)

    // Update the annotation with the selected point
    const annotations = store.config.annotations ?? { lines: [], texts: [], ranges: [] }
    store.updateConfig({
      annotations: {
        ...annotations,
        texts: (annotations.texts ?? []).map((t) =>
          t.id === activeId
            ? { ...t, x: closestX as number | string, y: yVal, ...offset, position: undefined }
            : t
        ),
      },
    })

    // Exit placement mode
    store.setPlacingAnnotation(null)
  }, [data, config])

  // Non-Plot chart types
  if (chartType === 'BigValue') {
    return <BigValueChart data={data} config={config} />
  }

  if (chartType === 'DataTable') {
    return <RichDataTable data={data} config={config} />
  }

  if (chartType === 'PieChart') {
    return <PieChartComponent data={data} config={config} height={height} autoHeight={autoHeight} />
  }

  if (chartType === 'Treemap') {
    return <TreemapComponent data={data} config={config} height={height} autoHeight={autoHeight} />
  }

  if (chartType === 'ChoroplethMap') {
    return <ChoroplethMap data={data} config={config} height={height} autoHeight={autoHeight} />
  }

  if (chartType === 'SymbolMap' || chartType === 'LocatorMap' || chartType === 'SpikeMap') {
    const variant = chartType === 'SymbolMap' ? 'symbol' : chartType === 'LocatorMap' ? 'locator' : 'spike'
    return <GeoPointMap data={data} config={config} height={height} autoHeight={autoHeight} mapVariant={variant} />
  }

  if (chartType === 'ElectionDonut') {
    return <ElectionDonut data={data} config={config} height={height} autoHeight={autoHeight} />
  }

  if (chartType === 'MultiplePies') {
    return <MultiplePies data={data} config={config} height={height} autoHeight={autoHeight} />
  }

  // Auto-height: flex layout fills available space. Fixed: explicit pixel height.
  const rootStyle: React.CSSProperties = autoHeight
    ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }
    : { width: '100%' }
  const chartStyle: React.CSSProperties = autoHeight
    ? { flex: 1, minHeight: 0, width: '100%', cursor: placingId ? 'crosshair' : undefined }
    : { width: '100%', height, cursor: placingId ? 'crosshair' : undefined }

  return (
    <div style={rootStyle}>
      {legendItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', padding: '0 0 6px', fontSize: 12 }}>
          {legendItems.map((item) => (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 1, backgroundColor: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
            </span>
          ))}
        </div>
      )}
      {heatmapLegend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 6px', fontSize: 12 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>{heatmapLegend.lo.toLocaleString()}</span>
          <span style={{ width: 120, height: 10, borderRadius: 2, background: 'linear-gradient(to right, rgb(255,255,204), rgb(255,234,155), rgb(254,206,108), rgb(254,165,71), rgb(252,106,50), rgb(234,44,34), rgb(195,7,35), rgb(128,0,38))' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>{heatmapLegend.hi.toLocaleString()}</span>
        </div>
      )}
      {showStartEndLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '0 0 6px', fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${colors[0]}`, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{chartType === 'ArrowPlot' ? 'Before' : 'Min'}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: colors[0], flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{chartType === 'ArrowPlot' ? 'After' : 'Max'}</span>
          </span>
        </div>
      )}
      {placingId && (
        <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--color-blue-500)', textAlign: 'center' }}>
          Click on the chart to place the point note
        </div>
      )}
      <div
        ref={containerRef}
        onClick={placingId ? handleChartClick : undefined}
        style={chartStyle}
      />
      {/* Collapsed footnotes: show annotation text below chart on narrow screens */}
      {shouldCollapseAnnotations(chartWidth) && config.annotations && (
        (() => {
          const notes = [
            ...(config.annotations.texts ?? []).map((t) => t.text),
            ...(config.annotations.lines ?? []).filter((l) => l.label).map((l) => l.label!),
            ...(config.annotations.ranges ?? []).filter((r) => r.label).map((r) => r.label!),
          ]
          if (notes.length === 0) return null
          return (
            <div style={{ padding: '8px 4px 0', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
              {notes.map((note, i) => (
                <div key={i} style={{ marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, marginRight: 4 }}>{i + 1}.</span>
                  {note}
                </div>
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}

// ── Mark Builders ───────────────────────────────────────────────────────────

function buildMarks(
  chartType: ChartType,
  data: Record<string, unknown>[],
  config: ChartConfig,
  colors: readonly string[] | string[],
  chartTheme?: ChartTheme,
): Plot.Markish[] {
  const x = config.x
  const y = config.y as string | undefined
  const series = config.series

  switch (chartType) {
    case 'LineChart':
      return buildLineMarks(data, x, y, series, config, colors)
    case 'BarChart':
      return buildBarMarks(data, x, y, series, config, colors, chartTheme)
    case 'AreaChart':
      return buildAreaMarks(data, x, y, series, config, colors, chartTheme)
    case 'ScatterPlot':
      return buildScatterMarks(data, x, y, series, config, colors)
    case 'Histogram':
      return buildHistogramMarks(data, x, config, colors)
    case 'HeatMap':
      return buildHeatMapMarks(data, x, y, series, colors)
    case 'BoxPlot':
      return buildBoxPlotMarks(data, x, y, colors, config)
    case 'DotPlot':
      return buildDotPlotMarks(data, x, y, series, config, colors)
    case 'RangePlot':
      return buildRangePlotMarks(data, x, y, config, colors)
    case 'BulletBar':
      return buildBulletBarMarks(data, x, y, config, colors)
    case 'SmallMultiples':
      return buildSmallMultiplesMarks(data, x, y, series, config, colors)
    case 'StackedColumn':
      return buildStackedColumnMarks(data, x, y, series, config, colors)
    case 'GroupedColumn':
      return buildGroupedColumnMarks(data, x, y, series, config, colors)
    case 'SplitBars':
      return buildSplitBarMarks(data, x, config, colors)
    case 'ArrowPlot':
      return buildArrowPlotMarks(data, x, config, colors)
    default:
      // Fallback: render as bar chart
      return buildBarMarks(data, x, y, series, config, colors)
  }
}

/** Build a clean human-readable tooltip string for Observable Plot tips.
 *  Replaces the default table-format that shows raw column names. */
function fmtTipValue(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return d3.timeFormat('%b %Y')(v)
  const n = Number(v)
  if (isFinite(n) && String(v) === String(n)) {
    // Use locale string for clean comma-separated formatting (avoids scientific notation)
    if (Number.isInteger(n)) return n.toLocaleString('en-US')
    // For decimals, keep up to 2 decimal places
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  // Check if string looks like an ISO date
  if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d3.timeFormat('%b %d, %Y')(d)
  }
  return String(v)
}

function parseUnitFromTitle(title: string): { prefix: string; suffix: string } | null {
  const unitMatch = title.match(/\(([^)]+)\)\s*$/)
  if (!unitMatch) return null
  let unit = unitMatch[1]
  // "out of N" → "/N"
  const outOf = unit.match(/^out\s+of\s+(.+)$/i)
  if (outOf) return { prefix: '', suffix: `/${outOf[1]}` }
  // Split leading currency symbols from trailing scale suffix
  const parts = unit.match(/^([$€£¥₹]?)(.*)$/)
  if (parts) return { prefix: parts[1], suffix: parts[2] }
  return { prefix: '', suffix: unit }
}

/** Detect scale/currency hints from natural language in titles and subtitles.
 *  e.g. "in billions of dollars" → { prefix: '$', suffix: 'B' } */
function detectScaleFromText(text: string): { prefix: string; suffix: string } | null {
  if (!text) return null
  const t = text.toLowerCase()
  // Detect currency
  const hasDollar = /\bdollars?\b|\busd\b|\$/.test(t)
  const prefix = hasDollar ? '$' : ''
  // Detect scale
  if (/\btrillions?\b|\btn\b/.test(t)) return { prefix, suffix: 'T' }
  if (/\bbillions?\b|\bbn\b/.test(t)) return { prefix, suffix: 'B' }
  if (/\bmillions?\b|\bmm\b/.test(t)) return { prefix, suffix: 'M' }
  if (/\bthousands?\b/.test(t)) return { prefix, suffix: 'K' }
  if (hasDollar) return { prefix: '$', suffix: '' }
  return null
}

function detectValueUnit(config?: ChartConfig, yCol?: string): { prefix: string; suffix: string } {
  const none = { prefix: '', suffix: '' }
  if (!config && !yCol) return none
  if (config?.valueFormat === 'percent') return { prefix: '', suffix: '%' }
  // Check both y-axis and x-axis titles for units (handles horizontal charts)
  const yTitle = config?.yAxisTitle ?? ''
  const xTitle = config?.xAxisTitle ?? ''
  if (/[%]|percent/i.test(yTitle) || /[%]|percent/i.test(xTitle)) return { prefix: '', suffix: '%' }
  if (yCol && /percent|pct/i.test(yCol)) return { prefix: '', suffix: '%' }
  // Try y-axis title first, then x-axis title (parenthesized units)
  const fromY = parseUnitFromTitle(yTitle)
  if (fromY) return fromY
  const fromX = parseUnitFromTitle(xTitle)
  if (fromX) return fromX
  // Fall back to natural-language detection in axis titles, chart title, and subtitle
  const fromYScale = detectScaleFromText(yTitle)
  if (fromYScale) return fromYScale
  const fromXScale = detectScaleFromText(xTitle)
  if (fromXScale) return fromXScale
  const fromTitle = detectScaleFromText(config?.title ?? '')
  if (fromTitle) return fromTitle
  // Check extraProps for subtitle (set by ChartWrapper)
  const subtitle = (config?.extraProps?.subtitle as string) ?? ''
  const fromSubtitle = detectScaleFromText(subtitle)
  if (fromSubtitle) return fromSubtitle
  return none
}

function fmtWithUnit(rawVal: string, unit: { prefix: string; suffix: string }): string {
  if (!rawVal) return ''
  return `${unit.prefix}${rawVal}${unit.suffix}`
}

/** Humanize a SQL column name into a clean tooltip label.
 *  "metric_name" → "Metric Name", "totalRevenue" → "Total Revenue",
 *  "hour_of_day" → "Hour Of Day", "visitors" → "Visitors" */
function titleCase(s: string): string {
  return s
    // Insert space before camelCase capitals: "totalRevenue" → "total Revenue"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]+/g, ' ')
    // Capitalize first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function tipTitle(
  d: Record<string, unknown>,
  xCol?: string, yCol?: string, seriesCol?: string,
  config?: ChartConfig,
): string {
  // Use custom tooltip template if provided
  if (config?.tooltipTemplate) {
    return renderTooltip(config.tooltipTemplate, d)
  }

  const unit = detectValueUnit(config, yCol)
  const cat = xCol && d[xCol] != null ? fmtTipValue(d[xCol]) : ''
  const ser = seriesCol && d[seriesCol] != null ? fmtTipValue(d[seriesCol]) : ''
  const val = yCol && d[yCol] != null ? fmtWithUnit(fmtTipValue(d[yCol]), unit) : ''
  if (cat && ser && val) return `${titleCase(xCol!)}: ${cat}\n${titleCase(seriesCol!)}: ${ser}\n${titleCase(yCol!)}: ${val}`
  if (cat && val) return `${titleCase(xCol!)}: ${cat}\n${titleCase(yCol!)}: ${val}`
  if (ser && val) return `${titleCase(seriesCol!)}: ${ser}\n${titleCase(yCol!)}: ${val}`
  if (cat) return `${titleCase(xCol!)}: ${cat}`
  return val
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
        strokeWidth: config.lineWidth ?? 2.5,
      }),
      Plot.tip(lineData, Plot.pointer({ x, y, stroke: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
    )
  } else {
    marks.push(
      Plot.lineY(lineData, {
        x, y,
        stroke: colors[0],
        strokeWidth: config.lineWidth ?? 2.5,
      }),
      Plot.tip(lineData, Plot.pointerX({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
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
  _colors: readonly string[] | string[],
  chartTheme?: ChartTheme,
): Plot.Markish[] {
  if (!x || !y) return []

  const marks: Plot.Markish[] = []

  if (config.horizontal) {
    // Horizontal bars: x is numeric, y is categorical
    const sortOpt = config.sort !== false
      ? { sort: { y: 'x' as const, reverse: (config.sortDir ?? 'desc') === 'desc' } }
      : {}

    // Gray bar track behind each bar (non-series only)
    if (!series && chartTheme?.plot.barTrack !== false) {
      const trackColor = chartTheme?.plot.barTrackColor || getComputedStyle(document.documentElement).getPropertyValue('--color-grid').trim() || '#e5e5e5'
      const maxVal = d3.max(data, (d) => Number(d[y] ?? 0)) ?? 0
      if (maxVal > 0) {
        marks.push(
          Plot.barX(data, { x: () => maxVal, y: x, fill: trackColor, ...sortOpt }),
        )
      }
    }

    if (series) {
      if (config.stacked) {
        marks.push(
          Plot.barX(data, Plot.stackX({ y: x, x: y, fill: series, ...sortOpt })),
          Plot.tip(data, Plot.pointerY({ x: y, y: x, fill: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
        )
      } else {
        marks.push(
          Plot.barX(data, { x: y, y: x, fill: series, fy: x, ...sortOpt }),
          Plot.tip(data, Plot.pointerY({ x: y, y: x, fill: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
        )
      }
    } else {
      marks.push(
        Plot.barX(data, { x: y, y: x, fill: x, ...sortOpt }),
        Plot.tip(data, Plot.pointerY({ x: y, y: x, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
      )
    }
  } else {
    // Vertical bars
    const sortKey = (config.sortDir ?? 'desc') === 'desc' ? '-y' as const : 'y' as const
    const sortOpt = config.sort !== false
      ? { sort: { x: sortKey } }
      : {}

    if (series) {
      marks.push(
        Plot.barY(data, {
          x, y,
          fill: series,
          ...(config.stacked ? {} : { fx: x }),
          ...sortOpt,
        }),
        Plot.tip(data, Plot.pointerX({ x, y, fill: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
      )
    } else {
      marks.push(
        Plot.barY(data, { x, y, fill: x, ...sortOpt }),
        Plot.tip(data, Plot.pointerX({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
      )
    }

    // Thick baseline at y=0 for vertical bars
    const baselineColor = chartTheme?.plot.baseline.color || getComputedStyle(document.documentElement).getPropertyValue('--color-axis').trim() || '#333333'
    const baselineWidth = chartTheme?.plot.baseline.width ?? 2
    marks.push(Plot.ruleY([0], { stroke: baselineColor, strokeWidth: baselineWidth }))
  }

  return marks
}

function buildAreaMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[],
  chartTheme?: ChartTheme,
): Plot.Markish[] {
  if (!x || !y) return []

  const areaData = maybeParseDates(data, x)
  // Theme-aware fill opacity: higher for low-contrast/grayscale themes
  const themeId = chartTheme?.id ?? 'default'
  const areaFillOpacity = themeId === 'academic' || themeId === 'minimal'
    ? 0.35
    : themeId === 'dark'
      ? 0.25
      : 0.15
  const fillColor = config.fillColor ?? `${colors[0]}26` // 15% opacity fallback for single-series
  const marks: Plot.Markish[] = []

  if (series) {
    if (config.stacked) {
      // Stacked area: use Plot.stackY to stack series on top of each other
      marks.push(
        Plot.areaY(areaData, Plot.stackY({ x, y, fill: series, fillOpacity: areaFillOpacity, order: 'value' })),
        Plot.lineY(areaData, Plot.stackY2({ x, y, stroke: series, strokeWidth: config.lineWidth ?? 2.5, order: 'value' })),
        Plot.tip(areaData, Plot.pointerX(Plot.stackY({ x, y, stroke: series, order: 'value', title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) }))),
      )
    } else {
      // Sort by x within each series to prevent zigzag area fill artifacts
      // when UNPIVOT data arrives interleaved by series at each x value
      marks.push(
        Plot.areaY(areaData, { x, y, fill: series, fillOpacity: areaFillOpacity, sort: x }),
        Plot.lineY(areaData, { x, y, stroke: series, strokeWidth: config.lineWidth ?? 2.5, sort: x }),
        Plot.tip(areaData, Plot.pointer({ x, y, stroke: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
      )
    }
  } else {
    marks.push(
      Plot.areaY(areaData, { x, y, fill: fillColor }),
      Plot.lineY(areaData, { x, y, stroke: colors[0], strokeWidth: config.lineWidth ?? 2.5 }),
      Plot.tip(areaData, Plot.pointerX({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
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

  const r = config.markerSize ?? 5
  const marks: Plot.Markish[] = []

  const scatterTip = (d: Record<string, unknown>) => {
    const xv = fmtTipValue(d[x])
    const yUnit = detectValueUnit(config, y)
    const yv = fmtWithUnit(fmtTipValue(d[y]), yUnit)
    const ser = series && d[series] != null ? String(d[series]) : ''
    const lines = []
    if (ser) lines.push(`${titleCase(series!)}: ${ser}`)
    lines.push(`${titleCase(x)}: ${xv}`)
    lines.push(`${titleCase(y)}: ${yv}`)
    return lines.join('\n')
  }

  if (series) {
    marks.push(
      Plot.dot(data, { x, y, fill: series, r, fillOpacity: 0.85 }),
      Plot.tip(data, Plot.pointer({ x, y, fill: series, title: scatterTip })),
    )
  } else {
    marks.push(
      Plot.dot(data, { x, y, fill: colors[0], r, fillOpacity: 0.85 }),
      Plot.tip(data, Plot.pointer({ x, y, title: scatterTip })),
    )
  }

  return marks
}

function buildHistogramMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x) return []

  // Compute nice, even bin thresholds
  const vals = data.map((d) => Number(d[x])).filter(isFinite)
  const [lo, hi] = d3.extent(vals) as [number, number]
  const thresholds = d3.ticks(lo, hi, 15)
  const fmt = d3.format(',.6~g')

  return [
    Plot.rectY(data, { ...Plot.binX({ y: 'count' }, { x, thresholds }), fill: colors[0] as string }),
    Plot.tip(data, Plot.pointerX(Plot.binX({ y: 'count', title: (bins: Record<string, unknown>[]) => {
      if (bins.length === 0) return ''
      const bv = bins.map((d) => Number(d[x!])).filter(isFinite)
      const minV = Math.min(...bv)
      // Find the threshold edges for this bin
      let binLo = thresholds[0], binHi = thresholds[thresholds.length - 1]
      for (let i = 0; i < thresholds.length - 1; i++) {
        if (minV >= thresholds[i] && minV < thresholds[i + 1]) {
          binLo = thresholds[i]; binHi = thresholds[i + 1]; break
        }
      }
      const rangeLabel = config?.xAxisTitle || titleCase(x!)
      return `${rangeLabel}: ${fmt(binLo)}–${fmt(binHi)}\nFrequency: ${bins.length.toLocaleString()}`
    } }, { x, thresholds }))),
  ]
}

/**
 * If a heatmap axis column has >20 distinct numeric values, bin into ~10 clean
 * buckets using d3.ticks and aggregate fill values with mean.
 */
function binHeatmapAxis(
  data: Record<string, unknown>[],
  axisCol: string,
  fillCol: string,
  groupCol: string | undefined,
): { data: Record<string, unknown>[]; binned: boolean; bucketOrder: string[]; edges?: number[] } {
  const distinct = new Set(data.map((d) => d[axisCol]))
  const allNumeric = [...distinct].every((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && isFinite(Number(v))))
  if (distinct.size <= 20 || !allNumeric) return { data, binned: false, bucketOrder: [] }

  const nums = [...distinct].map(Number).sort((a, b) => a - b)
  const lo = nums[0]
  const hi = nums[nums.length - 1]
  const ticks = d3.ticks(lo, hi, 10)
  // Build bin edges: [lo, tick1, tick2, …, hi]
  const edges = [lo, ...ticks.filter((t) => t > lo && t < hi), hi]

  function bucketLabel(low: number, high: number) {
    return `${low}–${high}`
  }

  function findBucket(v: number): string {
    for (let i = 0; i < edges.length - 1; i++) {
      if (v < edges[i + 1] || i === edges.length - 2) return bucketLabel(edges[i], edges[i + 1])
    }
    return bucketLabel(edges[edges.length - 2], edges[edges.length - 1])
  }

  // Group rows by (bucket, groupCol) and average the fill
  const groups = new Map<string, { sum: number; count: number; row: Record<string, unknown> }>()
  for (const row of data) {
    const bucket = findBucket(Number(row[axisCol]))
    const groupKey = groupCol ? String(row[groupCol] ?? '') : '__all__'
    const key = `${bucket}|||${groupKey}`
    const existing = groups.get(key)
    const fv = Number(row[fillCol])
    if (existing) {
      existing.sum += isFinite(fv) ? fv : 0
      existing.count += isFinite(fv) ? 1 : 0
    } else {
      groups.set(key, { sum: isFinite(fv) ? fv : 0, count: isFinite(fv) ? 1 : 0, row: { ...row, [axisCol]: bucket } })
    }
  }

  // Build ordered output preserving bucket order
  const bucketOrder = edges.slice(0, -1).map((e, i) => bucketLabel(e, edges[i + 1]))
  const result: Record<string, unknown>[] = []
  for (const bk of bucketOrder) {
    for (const [key, g] of groups) {
      if (key.startsWith(bk + '|||')) {
        result.push({ ...g.row, [fillCol]: g.count > 0 ? g.sum / g.count : 0 })
      }
    }
  }

  return { data: result, binned: true, bucketOrder, edges }
}

/** Sentinel column name used when y doubles as both y-axis and fill in a binned heatmap. */
const HEAT_FILL = '__heatFill'
/** Attached to preprocessed data so buildPlotOptions can set explicit domains. */
const HEAT_X_DOMAIN = '__heatXDomain'
const HEAT_Y_DOMAIN = '__heatYDomain'

/**
 * Pre-process heatmap data: bin x-axis and/or y-axis when they have
 * too many distinct numeric values for readable cells.
 *
 * Returns data with explicit `__heatXDomain` / `__heatYDomain` arrays
 * on the first row so `buildPlotOptions` can set ordered domains without
 * relying on data-row order (which is fragile for binned range labels).
 *
 * When no `series` is set, `y` serves dual duty as both y-axis position
 * and fill color.  In that case we store binned range labels in `y` (for
 * the categorical axis) and keep the numeric mean in a synthetic
 * `__heatFill` column (for the color scale).
 */
function preprocessHeatmapData(
  data: Record<string, unknown>[],
  config: ChartConfig,
): Record<string, unknown>[] {
  const x = config.x
  const y = config.y as string | undefined
  const series = config.series
  if (!x || !y) return data

  // ── Bin x-axis ──────────────────────────────────────────────
  const groupForX = series ?? y
  const xResult = binHeatmapAxis(data, x, y, groupForX !== x ? groupForX : undefined)
  let processed = xResult.data
  // Capture x-bin order from edges (numeric order, not data order)
  const xDomain: string[] | null = xResult.binned ? xResult.bucketOrder : null

  // ── Bin y-axis ──────────────────────────────────────────────
  let yDomain: string[] | null = null

  if (series) {
    const yResult = binHeatmapAxis(processed, series, y, x)
    processed = yResult.data
    if (yResult.binned) yDomain = yResult.bucketOrder
  } else {
    // No series: y doubles as y-axis AND fill.
    // We need to bin y into range labels for the axis while preserving
    // a numeric value for the color scale in __heatFill.
    const yBin = binHeatmapAxis(processed, y, y, x)
    if (yBin.binned) {
      yDomain = yBin.bucketOrder
      // binHeatmapAxis averaged y into itself — but y now holds a range
      // label string.  Recompute: group by (xVal, yBucket) and store
      // the numeric mean in __heatFill.
      const edges = yBin.edges!
      const bucketLabel = (low: number, high: number) => `${low}–${high}`
      const findBucket = (v: number): string => {
        for (let i = 0; i < edges.length - 1; i++) {
          if (v < edges[i + 1] || i === edges.length - 2) return bucketLabel(edges[i], edges[i + 1])
        }
        return bucketLabel(edges[edges.length - 2], edges[edges.length - 1])
      }
      const groups = new Map<string, { sum: number; count: number; row: Record<string, unknown> }>()
      // Use xResult.data (pre-y-binning) so original y values are still numeric
      for (const row of xResult.data) {
        const origY = Number(row[y])
        const bucket = isFinite(origY) ? findBucket(origY) : String(row[y])
        const xKey = String(row[x] ?? '')
        const key = `${xKey}|||${bucket}`
        const existing = groups.get(key)
        if (existing) {
          existing.sum += isFinite(origY) ? origY : 0
          existing.count += isFinite(origY) ? 1 : 0
        } else {
          groups.set(key, { sum: isFinite(origY) ? origY : 0, count: isFinite(origY) ? 1 : 0, row: { ...row } })
        }
      }
      // Build output in x-first order so x domain extraction from data order is correct
      const xLabels = xDomain ?? [...new Set(xResult.data.map((r) => String(r[x])))]
      const result: Record<string, unknown>[] = []
      for (const xLabel of xLabels) {
        for (const yLabel of yDomain) {
          const key = `${xLabel}|||${yLabel}`
          const g = groups.get(key)
          if (g) {
            const mean = g.count > 0 ? g.sum / g.count : 0
            result.push({ ...g.row, [y]: yLabel, [HEAT_FILL]: mean })
          }
        }
      }
      processed = result
    }
  }

  // Stash domain order on the first row for buildPlotOptions
  if (processed.length > 0 && (xDomain || yDomain)) {
    processed[0] = { ...processed[0], ...(xDomain ? { [HEAT_X_DOMAIN]: xDomain } : {}), ...(yDomain ? { [HEAT_Y_DOMAIN]: yDomain } : {}) }
  }

  return processed
}

function buildHeatMapMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  _colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []
  // HeatMap: x is one categorical axis, fill encodes the numeric heat value (always y).
  // When series is provided, it becomes the y-axis (second categorical dimension).
  // When no series, y doubles as both the y-axis and the fill.
  // After preprocessing, binned no-series heatmaps use __heatFill for the color scale.
  const yAxis = series ?? y
  const hasSyntheticFill = data.length > 0 && HEAT_FILL in data[0]
  const fill = hasSyntheticFill ? HEAT_FILL : y
  return [
    Plot.cell(data, { x, y: yAxis, fill }),
    Plot.tip(data, Plot.pointer({
      x, y: yAxis,
      title: (d: Record<string, unknown>) => {
        const fVal = d[fill] != null ? fmtTipValue(d[fill]) : ''
        return `${titleCase(x)}: ${fmtTipValue(d[x])}\n${titleCase(yAxis)}: ${fmtTipValue(d[yAxis])}${fVal ? `\n${titleCase(y)}: ${fVal}` : ''}`
      },
    })),
  ]
}

function buildBoxPlotMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  colors: readonly string[] | string[],
  config?: ChartConfig,
): Plot.Markish[] {
  if (!x || !y) return []
  return [
    Plot.boxY(data, { x, y, fill: colors[0] }),
    Plot.tip(data, Plot.pointer({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
  ]
}

function buildDotPlotMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const r = config.markerSize ?? 5
  const marks: Plot.Markish[] = []

  // Cleveland dot plot: horizontal, category on y-axis, value on x-axis
  // Check if zero is within the visible range (domain may be tightened)
  const nums = data.map((d) => Number(d[y])).filter((v) => isFinite(v))
  const dMin = nums.length > 0 ? nums.reduce((a, b) => (a < b ? a : b), nums[0]) : 0
  const dMax = nums.length > 0 ? nums.reduce((a, b) => (a > b ? a : b), nums[0]) : 0
  const zeroVisible = dMin <= 0 || dMin <= dMax * 0.4

  if (zeroVisible) {
    marks.push(Plot.ruleX([0], { strokeOpacity: 0.2 }))
  }

  if (series) {
    marks.push(
      Plot.dot(data, { x: y, y: x, fill: series, r, fillOpacity: 0.85 }),
      Plot.tip(data, Plot.pointer({ x: y, y: x, fill: series, maxRadius: 30, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) })),
    )
  } else {
    if (zeroVisible) {
      marks.push(Plot.ruleY(data, { y: x, x1: 0, x2: y, strokeOpacity: 0.2, stroke: colors[0] }))
    }
    marks.push(
      Plot.dot(data, { x: y, y: x, fill: colors[0], r, fillOpacity: 0.85 }),
      Plot.tip(data, Plot.pointer({ x: y, y: x, maxRadius: 30, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
    )
  }

  return marks
}

function buildRangePlotMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  // Range plot: x = category, y = midpoint (optional), minColumn/maxColumn required
  const minCol = config.minColumn
  const maxCol = config.maxColumn
  const cat = x

  if (!cat || !minCol || !maxCol) {
    // Fall back to showing dots if min/max columns not set
    if (x && y) {
      return [
        Plot.dot(data, { x, y, fill: colors[0], r: 5, fillOpacity: 0.85 }),
        Plot.tip(data, Plot.pointer({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
      ]
    }
    return []
  }

  const marks: Plot.Markish[] = []

  // Horizontal range bars: category on y-axis, range on x-axis
  marks.push(
    Plot.ruleY(data, { y: cat, x1: minCol, x2: maxCol, stroke: colors[0], strokeWidth: 3 }),
    Plot.dot(data, { x: minCol, y: cat, fill: colors[0], r: 5 }),
    Plot.dot(data, { x: maxCol, y: cat, fill: colors[0], r: 5 }),
    Plot.tip(data, Plot.pointer({ x: minCol, y: cat, title: (d: Record<string, unknown>) => {
      const unit = detectValueUnit(config, y)
      const fmt = (v: unknown) => { const n = Number(v); return isFinite(n) ? fmtWithUnit(d3.format(',.4~g')(n), unit) : String(v ?? '') }
      return `${titleCase(cat!)}: ${d[cat!] ?? ''}\nRange: ${fmt(d[minCol!])} – ${fmt(d[maxCol!])}`
    } })),
  )

  return marks
}

function buildBulletBarMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  // Bullet chart: x = category, y = actual value, targetColumn = target
  const cat = x
  const actual = y
  const targetCol = config.targetColumn

  if (!cat || !actual) return []

  const marks: Plot.Markish[] = []

  // Thin background bar to max value for context (light gray)
  marks.push(
    Plot.barX(data, { y: cat, x: actual, fill: colors[0], fillOpacity: 0.7 }),
  )

  // Target marker as a vertical rule
  if (targetCol) {
    marks.push(
      Plot.ruleX(data, { x: targetCol, y1: (d: Record<string, unknown>) => d[cat!], y2: (d: Record<string, unknown>) => d[cat!], stroke: '#333', strokeWidth: 2.5 }),
    )
    // Use tick marks for target instead (more visible)
    marks.push(
      Plot.tickX(data, { x: targetCol, y: cat, stroke: '#333', strokeWidth: 2.5 }),
    )
  }

  marks.push(
    Plot.tip(data, Plot.pointerY({ x: actual, y: cat, title: (d: Record<string, unknown>) => tipTitle(d, cat, actual, undefined, config) })),
  )

  return marks
}

function buildSmallMultiplesMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[]
): Plot.Markish[] {
  if (!x || !y) return []

  const facet = config.facetColumn ?? series
  if (!facet) {
    // No facet column: fall back to line chart
    return [
      Plot.lineY(maybeParseDates(data, x), { x, y, stroke: colors[0], strokeWidth: 2 }),
      Plot.tip(data, Plot.pointerX({ x, y, title: (d: Record<string, unknown>) => tipTitle(d, x, y, undefined, config) })),
    ]
  }

  const subtype = config.chartSubtype ?? 'line'
  const lineData = subtype === 'line' || subtype === 'area' ? maybeParseDates(data, x) : data
  const marks: Plot.Markish[] = []

  // Map each facet value to its color so lines/bars match the legend
  const facetValues = [...new Set(data.map((d) => String(d[facet] ?? '')))]
  facetValues.sort()
  const colorForFacet = (d: Record<string, unknown>) => colors[facetValues.indexOf(String(d[facet] ?? ''))] ?? colors[0]

  switch (subtype) {
    case 'bar':
      marks.push(
        Plot.barY(lineData, { x, y, fill: colorForFacet, fy: facet }),
        Plot.tip(lineData, Plot.pointerX({ x, y, fy: facet, title: (d: Record<string, unknown>) => tipTitle(d, x, y, facet, config) })),
      )
      break
    case 'area':
      marks.push(
        Plot.areaY(lineData, { x, y, fill: colorForFacet, fillOpacity: 0.3, fy: facet }),
        Plot.lineY(lineData, { x, y, stroke: colorForFacet, strokeWidth: 2, fy: facet }),
        Plot.tip(lineData, Plot.pointerX({ x, y, fy: facet, title: (d: Record<string, unknown>) => tipTitle(d, x, y, facet, config) })),
      )
      break
    case 'scatter':
      marks.push(
        Plot.dot(lineData, { x, y, fill: colorForFacet, r: 4, fy: facet }),
        Plot.tip(lineData, Plot.pointer({ x, y, fy: facet, title: (d: Record<string, unknown>) => tipTitle(d, x, y, facet, config) })),
      )
      break
    default: // 'line'
      marks.push(
        Plot.lineY(lineData, { x, y, stroke: colorForFacet, strokeWidth: 2, fy: facet }),
        Plot.tip(lineData, Plot.pointerX({ x, y, fy: facet, title: (d: Record<string, unknown>) => tipTitle(d, x, y, facet, config) })),
      )
  }

  return marks
}

// ── Phase 7 Mark Builders ───────────────────────────────────────────────────

function buildStackedColumnMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  _colors: readonly string[] | string[],
): Plot.Markish[] {
  if (!x || !y || !series) return []

  const marks: Plot.Markish[] = []

  marks.push(
    Plot.barY(data, Plot.stackY({ x, y, fill: series })),
    Plot.tip(data, Plot.pointer(Plot.stackY({ x, y, fill: series, title: (d: Record<string, unknown>) => tipTitle(d, x, y, series, config) }))),
    Plot.ruleY([0]),
  )

  return marks
}

function buildGroupedColumnMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  y: string | undefined,
  series: string | undefined,
  config: ChartConfig,
  _colors: readonly string[] | string[],
): Plot.Markish[] {
  if (!x || !y || !series) return []

  const marks: Plot.Markish[] = []

  marks.push(
    Plot.barY(data, { x: series, y, fill: series, fx: x }),
    Plot.tip(data, Plot.pointerX({ x: series, y, fill: series, fx: x, title: (d: Record<string, unknown>) => {
      const unit = detectValueUnit(config, y)
      const group = d[x] != null ? String(d[x]) : ''
      const ser = d[series] != null ? String(d[series]) : ''
      const val = d[y] != null ? fmtWithUnit(fmtTipValue(d[y]), unit) : ''
      return group ? `${titleCase(x)}: ${group}\n${titleCase(series)}: ${ser}\n${titleCase(y)}: ${val}` : `${titleCase(series)}: ${ser}\n${titleCase(y)}: ${val}`
    } })),
    Plot.ruleY([0]),
  )

  return marks
}

function buildSplitBarMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[],
): Plot.Markish[] {
  const cat = x
  const leftCol = config.leftColumn
  const rightCol = config.rightColumn

  if (!cat || !leftCol || !rightCol) return []

  const marks: Plot.Markish[] = []

  // Left bars: negative direction
  marks.push(
    Plot.barX(data, {
      y: cat,
      x: (d: Record<string, unknown>) => -Math.abs(Number(d[leftCol!] ?? 0)),
      fill: colors[0],
    }),
  )

  // Right bars: positive direction
  marks.push(
    Plot.barX(data, {
      y: cat,
      x: (d: Record<string, unknown>) => Math.abs(Number(d[rightCol!] ?? 0)),
      fill: colors[1] ?? colors[0],
    }),
  )

  // Tooltip — use pointerY so hovering anywhere on the row (left or right bar) triggers it
  marks.push(
    Plot.tip(data, Plot.pointerY({
      y: cat,
      x: 0,
      title: (d: Record<string, unknown>) => {
        const unit = detectValueUnit(config)
        const fmt = (v: unknown) => { const n = Number(v); return isFinite(n) ? fmtWithUnit(d3.format(',.4~g')(n), unit) : String(v ?? '') }
        return `${titleCase(cat!)}: ${d[cat!] ?? ''}\nLeft: ${fmt(d[leftCol!])}\nRight: ${fmt(d[rightCol!])}`
      },
    })),
  )

  // Center axis line
  marks.push(Plot.ruleX([0], { stroke: '#666', strokeWidth: 1 }))

  return marks
}

function buildArrowPlotMarks(
  data: Record<string, unknown>[],
  x: string | undefined,
  config: ChartConfig,
  colors: readonly string[] | string[],
): Plot.Markish[] {
  const cat = x
  const startCol = config.startColumn
  const endCol = config.endColumn

  if (!cat || !startCol || !endCol) return []

  const marks: Plot.Markish[] = []

  // Start dots (hollow)
  marks.push(
    Plot.dot(data, {
      x: startCol,
      y: cat,
      r: 5,
      fill: 'none',
      stroke: colors[0],
      strokeWidth: 1.5,
    }),
  )

  // Link from start to end
  marks.push(
    Plot.link(data, {
      x1: startCol,
      y1: cat,
      x2: endCol,
      y2: cat,
      stroke: colors[0],
      strokeWidth: 1.5,
      markerEnd: 'arrow',
    }),
  )

  // End dots (filled)
  marks.push(
    Plot.dot(data, {
      x: endCol,
      y: cat,
      r: 5,
      fill: colors[0],
    }),
  )

  // Tooltip anchored to the midpoint of each row so it triggers across the full range
  const tipFn = (d: Record<string, unknown>) => {
    const unit = detectValueUnit(config)
    const fmt = (v: unknown) => { const n = Number(v); return isFinite(n) ? fmtWithUnit(d3.format(',.4~g')(n), unit) : String(v ?? '') }
    return `${titleCase(cat!)}: ${d[cat!] ?? ''}\nStart: ${fmt(d[startCol!])}\nEnd: ${fmt(d[endCol!])}`
  }
  marks.push(
    Plot.tip(data, Plot.pointerY({
      x: (d: Record<string, unknown>) => (Number(d[startCol!]) + Number(d[endCol!])) / 2,
      y: cat,
      title: tipFn,
    })),
  )

  return marks
}

// ── Annotation Mark Builders ────────────────────────────────────────────────

function buildAnnotationMarks(
  annotations?: Annotations,
  bgColor = '#1e293b',
  _textColor = '#e2e8f0',
  chartTheme?: import('../../themes/chartThemes').ChartTheme,
): Plot.Markish[] {
  if (!annotations) return []

  const marks: Plot.Markish[] = []

  // Resolve annotation label style from chart theme
  const noteStyle = chartTheme?.font.notes
  const labelFontSize = noteStyle?.size ?? 11
  const labelFontWeight = noteStyle?.weight ?? 600
  const labelFontStyle = noteStyle?.italic ? 'italic' : 'normal'
  const labelFontFamily = chartTheme?.font.family || undefined

  // Reference lines (guard against legacy data missing sub-arrays)
  for (const line of annotations.lines ?? []) {
    const color = line.color ?? (noteStyle?.color || '#e45756')
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
            dy: -24, fontSize: labelFontSize, fill: color,
            fontWeight: labelFontWeight, fontStyle: labelFontStyle, fontFamily: labelFontFamily,
            stroke: bgColor, strokeWidth: 4,
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
            dx: -4, fontSize: labelFontSize, fill: color,
            fontWeight: labelFontWeight, fontStyle: labelFontStyle, fontFamily: labelFontFamily,
            stroke: bgColor, strokeWidth: 4,
            textAnchor: 'end', frameAnchor: 'right',
          })
        )
      }
    }
  }

  // Highlight ranges are rendered as raw SVG after Plot.plot() — see appendHighlightRanges()
  // Point notes are rendered as raw SVG after Plot.plot() — see appendPointNotes()

  return marks
}

// ── Y-Axis Label (raw SVG) ──────────────────────────────────────────────────

/** Append a rotated y-axis label to the left of the tick values, inside the extra margin. */
function appendYAxisLabel(svg: SVGSVGElement, plotEl: PlotElement, title: string) {
  // For faceted charts (fy), use the facet-y range to span all panels;
  // otherwise fall back to the y-scale range for a single-panel chart.
  let midY: number | undefined
  try {
    const fyScale = plotEl.scale('fy')
    const fyRange = fyScale.range as unknown as [number, number] | undefined
    if (fyRange) midY = (fyRange[0] + fyRange[1]) / 2
  } catch { /* no fy scale — not faceted */ }

  if (midY === undefined) {
    let yScale: ReturnType<PlotElement['scale']>
    try {
      yScale = plotEl.scale('y')
    } catch {
      return
    }
    const yRange = yScale.range as unknown as [number, number] | undefined
    if (!yRange) return
    midY = (yRange[0] + yRange[1]) / 2
  }
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#666'

  d3.select(svg).append('text')
    .attr('transform', `translate(14, ${midY}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', 12)
    .attr('fill', textColor)
    .text(title)
}

// ── Draggable Point Notes (raw SVG) ─────────────────────────────────────────

interface AppendPointNotesOpts {
  svg: SVGSVGElement
  plotEl: PlotElement
  annotations: PointAnnotation[]
  bgColor: string
  textColor: string
  fontFamily: string
  fontWeight: number
  fontStyle: string
  editable: boolean
  onDragEnd: (id: string, dx: number, dy: number, dxRatio: number, dyRatio: number) => void
}

function appendPointNotes({ svg, plotEl, annotations, bgColor, textColor, fontFamily, fontWeight, fontStyle, editable, onDragEnd }: AppendPointNotesOpts) {
  let xScale: ReturnType<PlotElement['scale']>
  let yScale: ReturnType<PlotElement['scale']>
  try {
    xScale = plotEl.scale('x')
    yScale = plotEl.scale('y')
  } catch {
    return // scales unavailable (e.g. pie chart)
  }

  // Plot area bounds for edge-clipping detection and responsive scaling
  const xRange = xScale.range as unknown as [number, number] | undefined
  const yRange = yScale.range as unknown as [number, number] | undefined
  const plotLeft = xRange ? Math.min(xRange[0], xRange[1]) : 0
  const plotRight = xRange ? Math.max(xRange[0], xRange[1]) : svg.clientWidth
  const plotWidth = plotRight - plotLeft
  const plotTop = yRange ? Math.min(yRange[0], yRange[1]) : 0
  const plotBottom = yRange ? Math.max(yRange[0], yRange[1]) : svg.clientHeight
  const plotHeight = plotBottom - plotTop

  const g = d3.select(svg).append('g').attr('class', 'point-notes')

  for (const ann of annotations) {
    const color = ann.color ?? textColor
    const fontSize = ann.fontSize ?? 11
    const { dx, dy } = resolveResponsiveOffset(ann, plotWidth, plotHeight)

    // Convert data coords → pixel coords
    const xVal = typeof ann.x === 'string' && /^\d{4}-\d{2}/.test(ann.x)
      ? new Date(ann.x)
      : ann.x
    const cx = xScale.apply(xVal)
    const cy = yScale.apply(ann.y)
    if (!isFinite(cx) || !isFinite(cy)) continue

    // Choose text-anchor based on proximity to plot edges
    const labelX = cx + dx
    const rightMargin = plotRight - labelX
    const leftMargin = labelX - plotLeft
    let anchor = 'middle'
    if (rightMargin < 40) anchor = 'end'
    else if (leftMargin < 40) anchor = 'start'

    const noteG = g.append('g')

    // Anchor dot
    noteG.append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 3.5)
      .attr('fill', color)
      .attr('stroke', bgColor)
      .attr('stroke-width', 1.5)

    // Connector line (hidden when distance < 8px)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const line = noteG.append('line')
      .attr('x1', cx)
      .attr('y1', cy)
      .attr('x2', cx + dx)
      .attr('y2', cy + dy)
      .attr('stroke', color)
      .attr('stroke-width', 0.75)
      .attr('stroke-opacity', dist < 8 ? 0 : 0.5)

    // Label text
    const text = noteG.append('text')
      .attr('x', cx + dx)
      .attr('y', cy + dy)
      .attr('text-anchor', anchor)
      .attr('dominant-baseline', 'central')
      .attr('font-family', fontFamily)
      .attr('font-size', fontSize)
      .attr('font-weight', fontWeight)
      .attr('font-style', fontStyle)
      .attr('fill', color)
      .attr('paint-order', 'stroke')
      .attr('stroke', bgColor)
      .attr('stroke-width', 4)
      .text(ann.text)

    // Drag behavior (editor only)
    if (editable) {
      text.style('cursor', 'grab')

      const drag = d3.drag<SVGTextElement, unknown>()
        .on('start', function () {
          d3.select(this).style('cursor', 'grabbing')
        })
        .on('drag', function (event) {
          const dragDx = event.x - cx
          const dragDy = event.y - cy
          d3.select(this).attr('x', event.x).attr('y', event.y)
          line.attr('x2', event.x).attr('y2', event.y)
          const d = Math.sqrt(dragDx * dragDx + dragDy * dragDy)
          line.attr('stroke-opacity', d < 8 ? 0 : 0.5)
        })
        .on('end', function (event) {
          d3.select(this).style('cursor', 'grab')
          const finalDx = Math.round(event.x - cx)
          const finalDy = Math.round(event.y - cy)
          const ratios = computeRatios(finalDx, finalDy, plotWidth, plotHeight)
          onDragEnd(ann.id, finalDx, finalDy, ratios.dxRatio, ratios.dyRatio)
        })

      text.call(drag)
    }
  }
}

// ── Draggable Highlight Ranges (raw SVG) ─────────────────────────────────────

type ScaleObj = ReturnType<PlotElement['scale']>

/** Invert a pixel position back to a data value, handling ordinal/band scales. */
function invertScale(
  scale: ScaleObj,
  px: number,
  dataValues?: unknown[],
): unknown {
  // Continuous scale (numeric, date) — use built-in invert
  if (scale.invert) return scale.invert(px)
  // Ordinal/band scale — snap to nearest value by pixel distance
  if (dataValues) {
    let closest = dataValues[0]
    let minDist = Infinity
    for (const v of dataValues) {
      const d = Math.abs(scale.apply(v) - px)
      if (d < minDist) { minDist = d; closest = v }
    }
    return closest
  }
  return px
}

interface AppendHighlightRangesOpts {
  svg: SVGSVGElement
  plotEl: PlotElement
  ranges: HighlightRange[]
  data: Record<string, unknown>[]
  xColumn?: string
  editable: boolean
  onRangeEdgeDrag: (id: string, patch: Partial<HighlightRange>) => void
}

function appendHighlightRanges({ svg, plotEl, ranges, data, xColumn, editable, onRangeEdgeDrag }: AppendHighlightRangesOpts) {
  let xScale: ScaleObj
  let yScale: ScaleObj
  try {
    xScale = plotEl.scale('x')
    yScale = plotEl.scale('y')
  } catch {
    return // scales unavailable
  }

  // Compute plot area bounds from scale ranges
  const xRange = xScale.range as unknown as [number, number] | undefined
  const yRange = yScale.range as unknown as [number, number] | undefined
  if (!xRange || !yRange) return

  const plotLeft = Math.min(xRange[0], xRange[1])
  const plotRight = Math.max(xRange[0], xRange[1])
  const plotTop = Math.min(yRange[0], yRange[1])
  const plotBottom = Math.max(yRange[0], yRange[1])

  // Collect x-axis data values for ordinal snapping
  const xDataValues = xColumn
    ? (() => {
        const seen = new Set<unknown>()
        const vals: unknown[] = []
        for (const row of data) {
          const v = row[xColumn]
          const parsed = typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? new Date(v) : v
          if (!seen.has(String(v))) { seen.add(String(v)); vals.push(parsed) }
        }
        return vals
      })()
    : undefined

  const g = d3.select(svg).append('g').attr('class', 'highlight-ranges')

  const HANDLE_WIDTH = 8 // hit area width in pixels

  for (const range of ranges) {
    const color = range.color ?? '#e45756'
    const opacity = range.opacity ?? 0.1

    if (range.axis === 'x') {
      // ── X-axis range (vertical edges) ──────────────────────────────────
      const startVal = typeof range.start === 'string' && /^\d{4}-\d{2}/.test(range.start)
        ? new Date(range.start) : range.start
      const endVal = typeof range.end === 'string' && /^\d{4}-\d{2}/.test(range.end)
        ? new Date(range.end) : range.end

      let startPx = xScale.apply(startVal)
      let endPx = xScale.apply(endVal)
      if (!isFinite(startPx) || !isFinite(endPx)) continue

      // Ensure start < end in pixel space
      if (startPx > endPx) { [startPx, endPx] = [endPx, startPx] }

      const rangeG = g.append('g')

      // Fill rect
      const fillRect = rangeG.append('rect')
        .attr('x', startPx)
        .attr('y', plotTop)
        .attr('width', endPx - startPx)
        .attr('height', plotBottom - plotTop)
        .attr('fill', color)
        .attr('fill-opacity', opacity)

      // Label (inside plot area so it doesn't clip)
      if (range.label) {
        rangeG.append('text')
          .attr('x', startPx + 4)
          .attr('y', plotTop + 12)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .attr('fill', color)
          .attr('text-anchor', 'start')
          .text(range.label)
      }

      if (editable) {
        // Start edge handle
        const startHandle = rangeG.append('rect')
          .attr('x', startPx - HANDLE_WIDTH / 2)
          .attr('y', plotTop)
          .attr('width', HANDLE_WIDTH)
          .attr('height', plotBottom - plotTop)
          .attr('fill', 'transparent')
          .style('cursor', 'ew-resize')

        // End edge handle
        const endHandle = rangeG.append('rect')
          .attr('x', endPx - HANDLE_WIDTH / 2)
          .attr('y', plotTop)
          .attr('width', HANDLE_WIDTH)
          .attr('height', plotBottom - plotTop)
          .attr('fill', 'transparent')
          .style('cursor', 'ew-resize')

        // Drag: start edge
        let currentStartPx = startPx
        let currentEndPx = endPx

        const startDrag = d3.drag<SVGRectElement, unknown>()
          .on('drag', function (event) {
            const newPx = Math.max(plotLeft, Math.min(plotRight, event.x))
            currentStartPx = newPx
            d3.select(this).attr('x', newPx - HANDLE_WIDTH / 2)
            // Resize fill rect
            const lo = Math.min(currentStartPx, currentEndPx)
            const hi = Math.max(currentStartPx, currentEndPx)
            fillRect.attr('x', lo).attr('width', hi - lo)
          })
          .on('end', function () {
            // Swap if dragged past the other edge
            const lo = Math.min(currentStartPx, currentEndPx)
            const hi = Math.max(currentStartPx, currentEndPx)
            const newStart = invertScale(xScale, lo, xDataValues)
            const newEnd = invertScale(xScale, hi, xDataValues)
            // Convert Date back to ISO string for storage
            const toVal = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : v
            onRangeEdgeDrag(range.id, {
              start: toVal(newStart) as number | string,
              end: toVal(newEnd) as number | string,
            })
          })

        // Drag: end edge
        const endDrag = d3.drag<SVGRectElement, unknown>()
          .on('drag', function (event) {
            const newPx = Math.max(plotLeft, Math.min(plotRight, event.x))
            currentEndPx = newPx
            d3.select(this).attr('x', newPx - HANDLE_WIDTH / 2)
            const lo = Math.min(currentStartPx, currentEndPx)
            const hi = Math.max(currentStartPx, currentEndPx)
            fillRect.attr('x', lo).attr('width', hi - lo)
          })
          .on('end', function () {
            const lo = Math.min(currentStartPx, currentEndPx)
            const hi = Math.max(currentStartPx, currentEndPx)
            const newStart = invertScale(xScale, lo, xDataValues)
            const newEnd = invertScale(xScale, hi, xDataValues)
            const toVal = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : v
            onRangeEdgeDrag(range.id, {
              start: toVal(newStart) as number | string,
              end: toVal(newEnd) as number | string,
            })
          })

        startHandle.call(startDrag)
        endHandle.call(endDrag)
      }
    } else {
      // ── Y-axis range (horizontal edges) ────────────────────────────────
      let startPy = yScale.apply(range.start)
      let endPy = yScale.apply(range.end)
      if (!isFinite(startPy) || !isFinite(endPy)) continue

      // In SVG, smaller y = higher on screen; ensure top < bottom
      const topPy = Math.min(startPy, endPy)
      const bottomPy = Math.max(startPy, endPy)

      const rangeG = g.append('g')

      // Fill rect
      const fillRect = rangeG.append('rect')
        .attr('x', plotLeft)
        .attr('y', topPy)
        .attr('width', plotRight - plotLeft)
        .attr('height', bottomPy - topPy)
        .attr('fill', color)
        .attr('fill-opacity', opacity)

      // Label
      if (range.label) {
        rangeG.append('text')
          .attr('x', plotLeft + 4)
          .attr('y', topPy - 4)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .attr('fill', color)
          .attr('text-anchor', 'start')
          .text(range.label)
      }

      if (editable) {
        // Top edge handle
        const topHandle = rangeG.append('rect')
          .attr('x', plotLeft)
          .attr('y', topPy - HANDLE_WIDTH / 2)
          .attr('width', plotRight - plotLeft)
          .attr('height', HANDLE_WIDTH)
          .attr('fill', 'transparent')
          .style('cursor', 'ns-resize')

        // Bottom edge handle
        const bottomHandle = rangeG.append('rect')
          .attr('x', plotLeft)
          .attr('y', bottomPy - HANDLE_WIDTH / 2)
          .attr('width', plotRight - plotLeft)
          .attr('height', HANDLE_WIDTH)
          .attr('fill', 'transparent')
          .style('cursor', 'ns-resize')

        let currentTopPy = topPy
        let currentBottomPy = bottomPy

        const topDrag = d3.drag<SVGRectElement, unknown>()
          .on('drag', function (event) {
            const newPy = Math.max(plotTop, Math.min(plotBottom, event.y))
            currentTopPy = newPy
            d3.select(this).attr('y', newPy - HANDLE_WIDTH / 2)
            const lo = Math.min(currentTopPy, currentBottomPy)
            const hi = Math.max(currentTopPy, currentBottomPy)
            fillRect.attr('y', lo).attr('height', hi - lo)
          })
          .on('end', function () {
            const lo = Math.min(currentTopPy, currentBottomPy)
            const hi = Math.max(currentTopPy, currentBottomPy)
            // Invert: lower pixel y → higher data value
            const hiVal = invertScale(yScale, lo)
            const loVal = invertScale(yScale, hi)
            // Keep start <= end in data space
            const numLo = Number(loVal)
            const numHi = Number(hiVal)
            onRangeEdgeDrag(range.id, {
              start: (isNaN(numLo) ? loVal : numLo) as number | string,
              end: (isNaN(numHi) ? hiVal : numHi) as number | string,
            })
          })

        const bottomDrag = d3.drag<SVGRectElement, unknown>()
          .on('drag', function (event) {
            const newPy = Math.max(plotTop, Math.min(plotBottom, event.y))
            currentBottomPy = newPy
            d3.select(this).attr('y', newPy - HANDLE_WIDTH / 2)
            const lo = Math.min(currentTopPy, currentBottomPy)
            const hi = Math.max(currentTopPy, currentBottomPy)
            fillRect.attr('y', lo).attr('height', hi - lo)
          })
          .on('end', function () {
            const lo = Math.min(currentTopPy, currentBottomPy)
            const hi = Math.max(currentTopPy, currentBottomPy)
            const hiVal = invertScale(yScale, lo)
            const loVal = invertScale(yScale, hi)
            const numLo = Number(loVal)
            const numHi = Number(hiVal)
            onRangeEdgeDrag(range.id, {
              start: (isNaN(numLo) ? loVal : numLo) as number | string,
              end: (isNaN(numHi) ? hiVal : numHi) as number | string,
            })
          })

        topHandle.call(topDrag)
        bottomHandle.call(bottomDrag)
      }
    }
  }
}

// ── Ordinal Domain Sorting ──────────────────────────────────────────────────

const DAYS_SHORT_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL_MON = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function rotateToSunday(days: string[]): string[] {
  // Move last element (Sun/Sunday) to front
  return [days[days.length - 1], ...days.slice(0, -1)]
}

/**
 * Detect day-of-week or month patterns in an ordinal domain and return
 * a properly ordered array. Returns the original domain unchanged if
 * no pattern is detected.
 */
function sortOrdinalDomain(domain: string[], config: ChartConfig): string[] {
  if (domain.length === 0) return domain

  // Normalise for matching (case-insensitive)
  const lower = domain.map((d) => String(d).toLowerCase())

  // Try each known ordinal sequence
  const sequences: [string[], string[]][] = [
    [DAYS_SHORT_MON, DAYS_SHORT_MON.map((d) => d.toLowerCase())],
    [DAYS_FULL_MON, DAYS_FULL_MON.map((d) => d.toLowerCase())],
    [MONTHS_SHORT, MONTHS_SHORT.map((d) => d.toLowerCase())],
    [MONTHS_FULL, MONTHS_FULL.map((d) => d.toLowerCase())],
  ]

  for (const [canonical, canonicalLower] of sequences) {
    // Check if every domain value is in this sequence
    if (lower.every((v) => canonicalLower.includes(v))) {
      const isDays = canonical === DAYS_SHORT_MON || canonical === DAYS_FULL_MON
      let ordered = canonical
      if (isDays && config.weekStartDay === 'Sun') {
        ordered = rotateToSunday(canonical)
      }
      // Return only the values that exist in the data, in canonical order,
      // preserving the original casing from the data
      const lowerToOriginal = new Map(domain.map((d) => [d.toLowerCase(), d]))
      return ordered.filter((v) => lowerToOriginal.has(v.toLowerCase())).map((v) => lowerToOriginal.get(v.toLowerCase())!)
    }
  }

  return domain
}

// ── Plot Options Builder ────────────────────────────────────────────────────

function buildPlotOptions(
  chartType: ChartType,
  data: Record<string, unknown>[],
  config: ChartConfig,
  colors: readonly string[] | string[],
  width: number,
  height: number,
  chartTheme?: import('../../themes/chartThemes').ChartTheme,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {}

  // Preserve data ordering for ordinal (string) x-axis values.
  // Observable Plot sorts ordinal domains alphabetically by default,
  // which breaks chronological or custom SQL ORDER BY.
  if (config.x && data.length > 0) {
    const sample = data[0][config.x]
    if (typeof sample === 'string' && !/^\d{4}-\d{2}/.test(sample)) {
      // Skip explicit domain for bar charts when sorting is enabled —
      // Observable Plot's sort option in marks needs to control the domain.
      // Also skip for GroupedColumn — its marks use fx for categories and x for series,
      // so the x domain must match series values, not category values.
      const skipDomain = (chartType === 'BarChart' && config.sort !== false) || chartType === 'GroupedColumn'
      if (!skipDomain) {
        const seen = new Set<string>()
        const domain: string[] = []
        for (const row of data) {
          const v = row[config.x] as string
          if (!seen.has(v)) { seen.add(v); domain.push(v) }
        }
        const sorted = sortOrdinalDomain(domain, config)
        // RangePlot, BulletBar, ArrowPlot, SplitBars use x-axis for numeric values
        // and y-axis for categories, so ordinal domain must go on y-axis
        const isInherentlyHorizontal = chartType === 'RangePlot' || chartType === 'BulletBar' || chartType === 'ArrowPlot' || chartType === 'SplitBars'
        if (config.horizontal || isInherentlyHorizontal) {
          overrides.y = { ...getBaseAxis(), domain: sorted }
        } else {
          overrides.x = { ...getBaseAxis(), domain: sorted }
        }
      }
    }
  }

  // HeatMap: preserve axis ordering.  Binned heatmaps stash explicit domain
  // arrays on the first row; categorical heatmaps extract from data order.
  if (chartType === 'HeatMap' && data.length > 0) {
    // X-axis domain — prefer explicit bin order from preprocessing
    const explicitXDomain = data[0][HEAT_X_DOMAIN] as string[] | undefined
    if (explicitXDomain) {
      overrides.x = { ...getBaseAxis(), domain: explicitXDomain }
    }
    // Y-axis domain — prefer explicit bin order, fall back to data order
    const explicitYDomain = data[0][HEAT_Y_DOMAIN] as string[] | undefined
    const yCol = config.series ?? (config.y as string | undefined)
    if (explicitYDomain) {
      overrides.y = { ...getBaseAxis(), domain: explicitYDomain }
    } else if (yCol) {
      const seen = new Set<string>()
      const yDomain: string[] = []
      for (const row of data) {
        const v = row[yCol] != null ? String(row[yCol]) : null
        if (v != null && !seen.has(v)) { seen.add(v); yDomain.push(v) }
      }
      overrides.y = { ...getBaseAxis(), domain: sortOrdinalDomain(yDomain, config) }
    }
  }

  // Axis labels — suppress Observable Plot's default column-name labels
  // (they overlap tick marks). Only show when user explicitly sets a title.
  // Determine tick rotation: explicit config, auto-rotate for narrow widths,
  // or auto-rotate when there are too many x-axis ticks to fit horizontally.
  const xDomainLen = ((overrides.x as Record<string, unknown> | undefined)?.domain as unknown[] | undefined)?.length ?? 0
  const labelsOverflow = xDomainLen > 0 && (width / xDomainLen) < 60
  const tickRotate = config.tickAngle ?? (width < 500 || labelsOverflow ? -45 : 0)
  overrides.x = {
    ...(overrides.x as Record<string, unknown> ?? {}),
    ...getBaseAxis(),
    label: config.xAxisTitle || null,
    // Center the label below the tick marks instead of inline at the right edge
    ...(config.xAxisTitle ? { labelAnchor: 'center', labelOffset: tickRotate ? 68 : 42, labelArrow: false } : {}),
    ...(tickRotate ? { tickRotate, textAnchor: 'end' } : {}),
  }
  // Extra bottom margin for rotated labels and/or x-axis title
  {
    let mb = (overrides.marginBottom as number | undefined) ?? 30
    if (tickRotate) mb = Math.max(mb, 60)
    if (config.xAxisTitle) mb = Math.max(mb, 52)
    // When BOTH rotated ticks and a title are present, stack the offsets
    if (tickRotate && config.xAxisTitle) mb = Math.max(mb, 85)
    overrides.marginBottom = mb
  }
  // Extra top margin when x-axis reference lines have labels (rendered above the plot area)
  if (config.annotations?.lines?.some((l) => l.axis === 'x' && l.label)) {
    overrides.marginTop = Math.max((overrides.marginTop as number | undefined) ?? 8, 36)
  }
  // Never let Observable Plot render the y-axis label — we render it manually
  // after plot creation (see appendYAxisLabel) to avoid overlap with tick values.
  overrides.y = {
    ...(overrides.y as Record<string, unknown> ?? {}),
    ...getBaseAxis(),
    label: null,
    grid: true,
  }
  // Horizontal bars need wider left margin for categorical labels
  if (config.horizontal || chartType === 'DotPlot' || chartType === 'RangePlot' || chartType === 'BulletBar' || chartType === 'ArrowPlot' || chartType === 'SplitBars') {
    overrides.marginLeft = 100
  }

  // DotPlot: auto-set x-axis domain to avoid large empty space when all values are far from zero
  if (chartType === 'DotPlot' && config.yAxisMin === undefined && config.yAxisMax === undefined) {
    const numCol = config.y as string | undefined
    if (numCol && data.length > 0) {
      const nums = data.map((d) => Number(d[numCol])).filter((v) => isFinite(v))
      if (nums.length > 0) {
        const dMin = nums.reduce((a, b) => (a < b ? a : b), nums[0])
        const dMax = nums.reduce((a, b) => (a > b ? a : b), nums[0])
        const range = dMax - dMin || 1
        // Only tighten domain when the min is far from zero (> 40% of max)
        if (dMin > 0 && dMin > dMax * 0.4) {
          const pad = range * 0.15
          const niceMin = Math.max(0, Math.floor((dMin - pad) * 2) / 2) // round down to nearest 0.5
          const niceMax = Math.ceil((dMax + pad) * 2) / 2 // round up to nearest 0.5
          const xOpts = (overrides.x as Record<string, unknown>) ?? { ...getBaseAxis() }
          xOpts.domain = [niceMin, niceMax]
          overrides.x = xOpts
        }
      }
    }
  }

  // Add extra left margin for the manually-rendered rotated y-axis label
  // (must run after horizontal-bar default so the +24 is additive, not overwritten)
  if (config.yAxisTitle) {
    overrides.marginLeft = (overrides.marginLeft as number | undefined) ?? 56
    overrides.marginLeft = (overrides.marginLeft as number) + 24
  }

  // Y-axis bounds — only set domain when at least one bound is provided.
  // Compute the missing bound from the data to avoid [value, undefined] which
  // Observable Plot cannot handle.
  // For horizontal bars the numeric axis is x (not y), so apply bounds there.
  if (config.yAxisMin !== undefined || config.yAxisMax !== undefined) {
    const yCol = config.y as string | undefined
    let dataMin = 0
    let dataMax = 0
    if (yCol && data.length > 0) {
      const nums = data.map((d) => Number(d[yCol])).filter((v) => isFinite(v))
      if (nums.length > 0) {
        // Avoid Math.min/max spread — stack overflow on 65K+ rows
        dataMin = nums.reduce((a, b) => (a < b ? a : b), nums[0])
        dataMax = nums.reduce((a, b) => (a > b ? a : b), nums[0])
      }
    }
    const domain = [config.yAxisMin ?? dataMin, config.yAxisMax ?? dataMax]
    if (config.horizontal) {
      const xOpts = (overrides.x as Record<string, unknown>) ?? { ...getBaseAxis() }
      xOpts.domain = domain
      overrides.x = xOpts
    } else {
      const yOpts = (overrides.y as Record<string, unknown>) ?? { ...getBaseAxis(), grid: true }
      yOpts.domain = domain
      overrides.y = yOpts
    }
  }

  // Chart-type-specific grid rules (overridden by explicit showGrid toggle)
  if (chartType === 'ScatterPlot') {
    overrides.grid = true // add x-axis gridlines for scatter
  } else if (config.horizontal) {
    // Horizontal bars: no gridlines
    const yOpts = overrides.y as Record<string, unknown>
    if (yOpts) yOpts.grid = false
  }

  // Grid toggle — controls both x (top-level) and y (axis-level) grid lines
  if (config.showGrid === false) {
    overrides.grid = false
    const yOpts = (overrides.y as Record<string, unknown>) ?? { ...getBaseAxis() }
    yOpts.grid = false
    overrides.y = yOpts
  }

  // Small multiples: add facet y-axis configuration + right margin for facet labels
  if (chartType === 'SmallMultiples') {
    const facet = config.facetColumn ?? config.series
    if (facet) {
      overrides.fy = { label: null }
      overrides.marginRight = 80
    }
  }

  // GroupedColumn: configure fx (facet x) axis — show group labels at bottom, suppress x ticks
  // since the series (H1/H2) is already in the legend
  if (chartType === 'GroupedColumn') {
    overrides.fx = { label: null, axis: 'bottom' }
    overrides.x = { ...(overrides.x as Record<string, unknown> ?? {}), axis: null }
  }

  // Color range — legend is always suppressed here; we render a custom React legend instead.
  // Set explicit domain (alphabetically sorted series values) to match the custom React legend's ordering.
  // HeatMap uses a sequential color scale (fill is numeric), not categorical.
  if (chartType === 'HeatMap') {
    overrides.color = { scheme: 'YlOrRd', legend: false }
  } else {
    const colorOpts: Record<string, unknown> = { range: [...colors], legend: false }
    if (config.series) {
      colorOpts.domain = getUniqueSeries(data, config.series, config)
    }
    overrides.color = colorOpts
  }

  return plotDefaults({
    width,
    height,
    ...overrides,
  }, chartTheme)
}

function getBaseAxis() {
  return { line: false, tickSize: 0, labelOffset: 8 }
}



// ── Legend Helper ───────────────────────────────────────────────────────────

function getUniqueSeries(data: Record<string, unknown>[], field: string, config?: ChartConfig): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const row of data) {
    const v = String(row[field] ?? '')
    if (!seen.has(v)) { seen.add(v); result.push(v) }
  }
  // Auto-sort day/month patterns; fall back to alphabetical for other ordinals
  const sorted = config ? sortOrdinalDomain(result, config) : result
  return sorted === result ? result.sort() : sorted
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

  const positiveIsGood = config.positiveIsGood !== false
  const valueField = config.value ?? (Array.isArray(config.y) ? config.y[0] : config.y)

  // Grid mode: multiple rows + metricLabel set
  if (shouldShowGrid(data.length, config.metricLabel)) {
    return (
      <div
        className="grid gap-4 w-full h-full content-center py-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {data.map((row, i) => {
          const label = config.metricLabel ? String(row[config.metricLabel] ?? '') : `Metric ${i + 1}`
          const value = valueField ? row[valueField as string] : null
          const compValue = config.comparisonValue ? row[config.comparisonValue] : null
          const unit = config.unitColumn ? row[config.unitColumn] : undefined
          const pctDelta = computePctDelta(value, compValue)

          return (
            <div
              key={i}
              className="rounded-xl border border-border-default bg-surface p-4 flex flex-col"
            >
              <div className="text-xs font-medium text-text-muted mb-1 truncate">{label}</div>
              <div className="text-2xl font-bold text-chart-blue">
                {formatBigValue(value, config.valueFormat, unit)}
              </div>
              {pctDelta !== null && (
                <div
                  className={`text-xs mt-1 font-medium ${
                    (pctDelta >= 0) === positiveIsGood ? 'text-chart-green' : 'text-chart-red'
                  }`}
                >
                  {formatDelta(pctDelta)}
                  {config.comparisonLabel && (
                    <span className="text-text-muted ml-1 font-normal">
                      {config.comparisonLabel}
                      {compValue != null && ` of ${formatBigValue(compValue, config.valueFormat, unit, value)}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Single-value mode (original behavior)
  const row = data[0]
  const value = valueField ? row[valueField as string] : null
  const compValue = config.comparisonValue ? row[config.comparisonValue] : null
  const unit = config.unitColumn ? row[config.unitColumn] : undefined
  const pctDelta = computePctDelta(value, compValue)

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      <div className="text-4xl font-bold text-chart-blue">
        {formatBigValue(value, config.valueFormat, unit)}
      </div>
      {pctDelta !== null && (
        <div
          className={`text-sm mt-2 font-medium ${
            (pctDelta >= 0) === positiveIsGood ? 'text-chart-green' : 'text-chart-red'
          }`}
        >
          {formatDelta(pctDelta)}
          {config.comparisonLabel && (
            <span className="text-text-muted ml-1 font-normal">
              {config.comparisonLabel}
              {compValue != null && ` of ${formatBigValue(compValue, config.valueFormat, unit, value)}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PieChartComponent({ data, config, height, autoHeight }: { data: Record<string, unknown>[]; config: ChartConfig; height: number; autoHeight?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const chartTheme = useChartThemeStore((s) => s.theme)

  // ResizeObserver to re-render when container width changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    d3.select(el).selectAll('svg').remove()

    if (data.length === 0) return

    const keys = Object.keys(data[0])
    const labelField = config.x ?? keys[0]
    const valueField = (config.value ?? config.y ?? keys[1]) as string | undefined
    if (!valueField) return // Single-column data — no numeric column to chart
    const width = containerWidth || el.clientWidth
    const effectiveHeight = autoHeight ? el.clientHeight : height
    if (width <= 0 || effectiveHeight <= 0) return // waiting for layout

    // Reserve space for external labels — scale with available space
    const isExternal = chartTheme.pie.labelStyle === 'external'
    const compact = effectiveHeight < 280
    const hLabelSpace = isExternal ? Math.min(compact ? 50 : 80, width * (compact ? 0.12 : 0.18)) : 10
    const vLabelSpace = isExternal ? Math.min(compact ? 15 : 30, effectiveHeight * 0.06) : 10
    const maxRadiusW = (width - hLabelSpace * 2) / 2
    const maxRadiusH = (effectiveHeight - vLabelSpace * 2) / 2
    const radius = Math.max(40, Math.min(maxRadiusW, maxRadiusH))
    const labelFontSize = Math.max(14, Math.round(effectiveHeight / 16))

    const pieData = data.map((d) => ({
      label: String(d[labelField] ?? ''),
      value: Number(d[valueField] ?? 0),
    })).filter((d) => d.value > 0)

    if (pieData.length === 0) return  // No valid slices (all zero/negative)

    const total = d3.sum(pieData, (d) => d.value)

    const colors = config.colorRange ? [...config.colorRange] : config.color ? [config.color] : [...chartTheme.palette.colors]
    const colorScale = d3.scaleOrdinal(colors)

    const pie = d3.pie<{ label: string; value: number }>().value((d) => d.value).sort(null)
    const innerR = radius * (chartTheme.pie.innerRadius ?? 0)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(innerR)
      .outerRadius(radius)

    // Expand viewBox to prevent left-side label clipping — labels at
    // radius*1.25 plus text can exceed the centered group's left boundary.
    const labelOverflow = isExternal ? hLabelSpace + 20 : 0
    const svgWidth = width + labelOverflow * 2
    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', effectiveHeight)
      .attr('viewBox', `${-labelOverflow} 0 ${svgWidth} ${effectiveHeight}`)

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${effectiveHeight / 2})`)

    const sliceStroke = chartTheme.pie.sliceStroke || (resolved === 'dark' ? '#1e293b' : '#ffffff')
    const sliceStrokeWidth = chartTheme.pie.sliceStrokeWidth ?? 1

    const arcs = pie(pieData)

    g.selectAll('path')
      .data(arcs)
      .join('path')
      .attr('d', arc as never)
      .attr('fill', (_, i) => colorScale(String(i)))
      .attr('stroke', sliceStroke)
      .attr('stroke-width', sliceStrokeWidth)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.8)
        const rect = el.getBoundingClientRect()
        const pct = ((d.data.value / total) * 100).toFixed(1)
        const unit = detectValueUnit(config)
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 28,
          text: `${d.data.label}: ${fmtWithUnit(d3.format(',.4~g')(d.data.value), unit)} (${pct}%)`,
        })
      })
      .on('mousemove', function (event) {
        const rect = el.getBoundingClientRect()
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top - 28 } : null)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1)
        setTooltip(null)
      })

    const textColor = chartTheme.font.axis?.color || (resolved === 'dark' ? '#e2e8f0' : '#374151')

    if (isExternal) {
      // External labels with connector polylines and dots
      const connectorStart = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
        .innerRadius(radius * 1.02)
        .outerRadius(radius * 1.02)

      const connectorMid = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
        .innerRadius(radius * 1.12)
        .outerRadius(radius * 1.12)

      const connectorColor = chartTheme.pie.connectorColor || getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() || '#999999'
      const dotRadius = chartTheme.pie.connectorDotRadius ?? 3

      // Connector polylines
      g.selectAll('polyline')
        .data(arcs)
        .join('polyline')
        .attr('points', (d) => {
          const posA = connectorStart.centroid(d)
          const posB = connectorMid.centroid(d)
          const midAngle = (d.startAngle + d.endAngle) / 2
          const posC: [number, number] = [
            (radius * 1.22) * (midAngle < Math.PI ? 1 : -1),
            posB[1],
          ]
          return [posA, posB, posC].map((p) => p.join(',')).join(' ')
        })
        .attr('fill', 'none')
        .attr('stroke', connectorColor)
        .attr('stroke-width', 1)

      // Connector dots at slice edge
      g.selectAll('circle.connector-dot')
        .data(arcs)
        .join('circle')
        .attr('class', 'connector-dot')
        .attr('cx', (d) => connectorStart.centroid(d)[0])
        .attr('cy', (d) => connectorStart.centroid(d)[1])
        .attr('r', dotRadius)
        .attr('fill', connectorColor)

      // Label text
      g.selectAll('text')
        .data(arcs)
        .join('text')
        .attr('transform', (d) => {
          const pos = connectorMid.centroid(d)
          const midAngle = (d.startAngle + d.endAngle) / 2
          return `translate(${(radius * 1.25) * (midAngle < Math.PI ? 1 : -1)},${pos[1]})`
        })
        .attr('text-anchor', (d) => {
          const midAngle = (d.startAngle + d.endAngle) / 2
          return midAngle < Math.PI ? 'start' : 'end'
        })
        .attr('dominant-baseline', 'central')
        .attr('font-size', labelFontSize)
        .attr('font-family', chartTheme.font.family)
        .attr('fill', textColor)
        .text((d) => {
          const pct = ((d.data.value / total) * 100).toFixed(0)
          return `${d.data.label} (${pct}%)`
        })
    } else {
      // Internal labels (donut themes)
      const labelArc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
        .innerRadius(radius * 0.75)
        .outerRadius(radius * 0.75)

      g.selectAll('text')
        .data(arcs)
        .join('text')
        .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 11)
        .attr('font-family', chartTheme.font.family)
        .attr('fill', textColor)
        .text((d) => d.data.value > 0 ? d.data.label : '')
    }

  }, [data, config, height, autoHeight, resolved, chartTheme, containerWidth])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative', ...(autoHeight ? { height: '100%' } : { height }) }}>
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateX(-50%)',
          background: chartTheme.card.background || (resolved === 'dark' ? '#1e293b' : '#fff'),
          color: chartTheme.font.axis?.color || (resolved === 'dark' ? '#e2e8f0' : '#374151'),
          border: `1px solid ${chartTheme.card.borderColor || (resolved === 'dark' ? '#475569' : '#d1d5db')}`,
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: chartTheme.font.family,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

function TreemapComponent({ data, config, height, autoHeight }: { data: Record<string, unknown>[]; config: ChartConfig; height: number; autoHeight?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: string } | null>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const themePalette = useChartThemeStore((s) => s.theme.palette.colors)

  // ResizeObserver to re-render when container width changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Clear only the SVG, not the tooltip div
    d3.select(el).selectAll('svg').remove()

    if (data.length === 0) return

    const keys = Object.keys(data[0])
    const labelField = config.x ?? keys[0]
    const valueField = (config.value ?? config.y ?? keys[1]) as string | undefined
    if (!valueField) return // Single-column data — no numeric column to chart
    const width = containerWidth || el.clientWidth
    const effectiveHeight = autoHeight ? el.clientHeight : height
    if (width <= 0 || effectiveHeight <= 0) return // waiting for layout

    const treeData = data.map((d) => ({
      name: String(d[labelField] ?? ''),
      value: Math.abs(Number(d[valueField] ?? 0)),
    })).filter((d) => d.value > 0)

    interface TreeNode { name: string; value: number; children?: TreeNode[] }
    const rootData: TreeNode = { name: 'root', value: 0, children: treeData }
    const root = d3.hierarchy(rootData).sum((d) => d.value)
    const totalValue = d3.sum(treeData, (d) => d.value)

    d3.treemap<TreeNode>().size([width, effectiveHeight]).padding(2)(root)

    const colors = config.colorRange ? [...config.colorRange] : config.color ? [config.color] : [...themePalette]
    const colorScale = d3.scaleOrdinal(colors)

    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', effectiveHeight)
      .style('position', 'absolute')
      .style('top', 0)
      .style('left', 0)

    type TreeLeaf = d3.HierarchyRectangularNode<TreeNode>
    const nodes = root.leaves() as TreeLeaf[]

    // Clip definitions so labels don't overflow their rectangles
    const defs = svg.append('defs')
    nodes.forEach((d, i) => {
      defs.append('clipPath')
        .attr('id', `treemap-clip-${i}`)
        .append('rect')
        .attr('x', d.x0)
        .attr('y', d.y0)
        .attr('width', d.x1 - d.x0)
        .attr('height', d.y1 - d.y0)
    })

    svg.selectAll('rect.cell')
      .data(nodes)
      .join('rect')
      .attr('class', 'cell')
      .attr('x', (d) => d.x0)
      .attr('y', (d) => d.y0)
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (_, i) => colorScale(String(i)))
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.85)
        const rect = el.getBoundingClientRect()
        const pct = ((d.data.value / totalValue) * 100).toFixed(1)
        const unit = detectValueUnit(config)
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          name: d.data.name,
          value: `${fmtWithUnit(d3.format(',.0f')(d.data.value), unit)} (${pct}%)`,
        })
      })
      .on('mousemove', function (event) {
        const rect = el.getBoundingClientRect()
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1)
        setTooltip(null)
      })

    const labelFontSize = 12
    const charWidth = labelFontSize * 0.6 // approximate character width
    svg.selectAll('text.label')
      .data(nodes)
      .join('text')
      .attr('class', 'label')
      .attr('x', (d) => d.x0 + 5)
      .attr('y', (d) => d.y0 + 16)
      .attr('clip-path', (_, i) => `url(#treemap-clip-${i})`)
      .attr('font-size', labelFontSize)
      .attr('font-weight', 500)
      .attr('fill', resolved === 'dark' ? '#e2e8f0' : '#fff')
      .attr('pointer-events', 'none')
      .text((d) => {
        const tileW = d.x1 - d.x0
        const tileH = d.y1 - d.y0
        if (tileW < 30 || tileH < 20) return '' // too small for any label
        const availW = tileW - 10 // padding
        const maxChars = Math.floor(availW / charWidth)
        const name = d.data.name
        if (name.length <= maxChars) return name
        if (maxChars < 4) return '' // not enough room for truncation
        return name.slice(0, maxChars - 1) + '\u2026' // ellipsis
      })

  }, [data, config, height, autoHeight, resolved, themePalette, containerWidth])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative', ...(autoHeight ? { height: '100%' } : { height }) }}>
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            ...(tooltip.x > (containerWidth || 400) * 0.6
              ? { right: (containerWidth || 400) - tooltip.x + 12 }
              : { left: tooltip.x + 12 }),
            top: Math.max(0, tooltip.y - 30),
            background: 'var(--color-surface-raised, #1e293b)',
            color: 'var(--color-text-primary, #e2e8f0)',
            border: '1px solid var(--color-border-default, #334155)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip.name}</div>
          <div style={{ opacity: 0.8 }}>{tooltip.value}</div>
        </div>
      )}
    </div>
  )
}

