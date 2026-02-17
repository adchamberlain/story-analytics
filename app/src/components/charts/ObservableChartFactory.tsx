import { useRef, useEffect, useCallback } from 'react'
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { useObservablePlot } from '../../hooks/useObservablePlot'
import { plotDefaults } from '../../themes/datawrapper'
import { useThemeStore } from '../../stores/themeStore'
import { useChartThemeStore } from '../../stores/chartThemeStore'
import { useEditorStore } from '../../stores/editorStore'
import { getXValues, getYForX, resolveOffset, smartOffset } from '../../utils/annotationDefaults'
import type { ChartConfig, ChartType, Annotations, PointAnnotation, HighlightRange } from '../../types/chart'

/** Minimal type for the Observable Plot element with scale access. */
interface PlotElement extends HTMLElement {
  scale: (name: string) => { apply: (v: unknown) => number; domain?: unknown[]; range?: unknown[]; invert?: (px: number) => unknown }
}

interface ObservableChartFactoryProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  chartType: ChartType
  height?: number
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

  // Build custom legend data — unique series values mapped to palette colors.
  // We never rely on Observable Plot's built-in legend (unreliable for stroke marks).
  const showLegend = config.showLegend !== false && !!config.series
  const legendItems = showLegend
    ? getUniqueSeries(data, config.series!).map((label, i) => ({
        label,
        color: colors[i % colors.length],
      }))
    : []

  // Ref to the Observable Plot element — used for scale inversion on click-to-place
  const plotRef = useRef<PlotElement | null>(null)

  const { containerRef } = useObservablePlot(
    (width) => {
      const marks = buildMarks(chartType, data, config, colors)
      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-raised').trim() || '#1e293b'
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim() || '#e2e8f0'
      const annotationMarks = buildAnnotationMarks(config.annotations, bgColor, textColor)
      const plotOptions = buildPlotOptions(chartType, data, config, colors, width, height, chartTheme)
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

      // Highlight ranges first (renders behind point notes in z-order)
      if (svg && config.annotations?.ranges?.length) {
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
                ranges: anns.ranges.map((r) => r.id === id ? { ...r, ...patch } : r),
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
      if (svg && config.annotations?.texts?.length) {
        appendPointNotes({
          svg: svg as SVGSVGElement,
          plotEl,
          annotations: config.annotations.texts,
          bgColor,
          textColor,
          editable,
          onDragEnd: (id, dx, dy) => {
            const store = useEditorStore.getState()
            const anns = store.config.annotations
            store.updateConfig({
              annotations: {
                ...anns,
                texts: anns.texts.map((t) =>
                  t.id === id ? { ...t, dx, dy, position: undefined } : t
                ),
              },
            })
          },
        })
      }

      return plot
    },
    [data, config, chartType, height, resolved, editable, chartTheme]
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
    const annotations = store.config.annotations
    store.updateConfig({
      annotations: {
        ...annotations,
        texts: annotations.texts.map((t) =>
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
    return <DataTableChart data={data} config={config} />
  }

  if (chartType === 'PieChart') {
    return <PieChartComponent data={data} config={config} height={height} />
  }

  if (chartType === 'Treemap') {
    return <TreemapComponent data={data} config={config} height={height} />
  }

  return (
    <div style={{ width: '100%' }}>
      {legendItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '0 0 6px', fontSize: 12 }}>
          {legendItems.map((item) => (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: item.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
            </span>
          ))}
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
        style={{ width: '100%', height, cursor: placingId ? 'crosshair' : undefined }}
      />
    </div>
  )
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

function buildAnnotationMarks(annotations?: Annotations, bgColor = '#1e293b', _textColor = '#e2e8f0'): Plot.Markish[] {
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
            dx: -4, fontSize: 11, fill: color, fontWeight: 600,
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
  let yScale: ReturnType<PlotElement['scale']>
  try {
    yScale = plotEl.scale('y')
  } catch {
    return
  }

  const yRange = yScale.range as unknown as [number, number] | undefined
  if (!yRange) return

  const midY = (yRange[0] + yRange[1]) / 2
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
  editable: boolean
  onDragEnd: (id: string, dx: number, dy: number) => void
}

function appendPointNotes({ svg, plotEl, annotations, bgColor, textColor, editable, onDragEnd }: AppendPointNotesOpts) {
  let xScale: ReturnType<PlotElement['scale']>
  let yScale: ReturnType<PlotElement['scale']>
  try {
    xScale = plotEl.scale('x')
    yScale = plotEl.scale('y')
  } catch {
    return // scales unavailable (e.g. pie chart)
  }

  // Plot area bounds for edge-clipping detection
  const xRange = xScale.range as unknown as [number, number] | undefined
  const plotLeft = xRange ? Math.min(xRange[0], xRange[1]) : 0
  const plotRight = xRange ? Math.max(xRange[0], xRange[1]) : svg.clientWidth

  const g = d3.select(svg).append('g').attr('class', 'point-notes')

  for (const ann of annotations) {
    const color = ann.color ?? textColor
    const fontSize = ann.fontSize ?? 11
    const { dx, dy } = resolveOffset(ann)

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
      .attr('font-size', fontSize)
      .attr('font-weight', 600)
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
          onDragEnd(ann.id, finalDx, finalDy)
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

// ── Plot Options Builder ────────────────────────────────────────────────────

function buildPlotOptions(
  _chartType: ChartType,
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
      const seen = new Set<string>()
      const domain: string[] = []
      for (const row of data) {
        const v = row[config.x] as string
        if (!seen.has(v)) { seen.add(v); domain.push(v) }
      }
      overrides.x = { ...getBaseAxis(), domain }
    }
  }

  // Axis labels — suppress Observable Plot's default column-name labels
  // (they overlap tick marks). Only show when user explicitly sets a title.
  overrides.x = {
    ...(overrides.x as Record<string, unknown> ?? {}),
    ...getBaseAxis(),
    label: config.xAxisTitle || null,
    // Center the label below the tick marks instead of inline at the right edge
    ...(config.xAxisTitle ? { labelAnchor: 'center', labelOffset: 36, labelArrow: false } : {}),
  }
  // Never let Observable Plot render the y-axis label — we render it manually
  // after plot creation (see appendYAxisLabel) to avoid overlap with tick values.
  overrides.y = {
    ...(overrides.y as Record<string, unknown> ?? {}),
    ...getBaseAxis(),
    label: null,
    grid: true,
  }
  // Add extra left margin for the manually-rendered rotated y-axis label
  if (config.yAxisTitle) {
    overrides.marginLeft = (overrides.marginLeft as number | undefined) ?? 56
    overrides.marginLeft = (overrides.marginLeft as number) + 24
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

  // Grid toggle — controls both x (top-level) and y (axis-level) grid lines
  if (config.showGrid === false) {
    overrides.grid = false
    const yOpts = (overrides.y as Record<string, unknown>) ?? { ...getBaseAxis() }
    yOpts.grid = false
    overrides.y = yOpts
  }

  // Color range — legend is always suppressed here; we render a custom React legend instead
  overrides.color = { range: [...colors], legend: false }

  return plotDefaults({
    width,
    height,
    ...overrides,
  }, chartTheme)
}

function getBaseAxis() {
  return { line: true, tickSize: 0, labelOffset: 8 }
}



// ── Legend Helper ───────────────────────────────────────────────────────────

function getUniqueSeries(data: Record<string, unknown>[], field: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const row of data) {
    const v = String(row[field] ?? '')
    if (!seen.has(v)) { seen.add(v); result.push(v) }
  }
  return result
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
  const themePalette = useChartThemeStore((s) => s.theme.palette.colors)

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

    const colors = config.colorRange ? [...config.colorRange] : config.color ? [config.color] : [...themePalette]
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
  }, [data, config, height, resolved, themePalette])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function TreemapComponent({ data, config, height }: { data: Record<string, unknown>[]; config: ChartConfig; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const themePalette = useChartThemeStore((s) => s.theme.palette.colors)

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

    const colors = config.colorRange ? [...config.colorRange] : config.color ? [config.color] : [...themePalette]
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
  }, [data, config, height, resolved, themePalette])

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
