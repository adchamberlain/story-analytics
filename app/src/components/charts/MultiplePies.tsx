import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { useThemeStore } from '../../stores/themeStore'
import { useChartThemeStore } from '../../stores/chartThemeStore'
import type { ChartConfig } from '../../types/chart'

interface MultiplePiesProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  height: number
  autoHeight?: boolean
}

/**
 * Small-multiples grid of pie or donut charts.
 * Groups data by `facetColumn` and renders one pie per group.
 * Uses `pieVariant` to choose between 'pie' (no inner radius) and 'donut'.
 */
export function MultiplePies({ data, config, height, autoHeight }: MultiplePiesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const chartTheme = useChartThemeStore((s) => s.theme)

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

    el.innerHTML = ''

    if (data.length === 0) return

    const keys = Object.keys(data[0])
    const labelField = config.x ?? keys[0]
    const valueField = (config.value ?? config.y ?? keys[1]) as string | undefined
    const facetField = config.facetColumn ?? config.series
    if (!valueField || !facetField) return

    const width = containerWidth || el.clientWidth
    const effectiveHeight = autoHeight ? el.clientHeight : height
    if (width <= 0 || effectiveHeight <= 0) return

    // Group data by facet column
    const groups = d3.group(data, (d) => String(d[facetField] ?? ''))
    const groupKeys = Array.from(groups.keys()).sort()
    const numGroups = groupKeys.length

    if (numGroups === 0) return

    // Layout: single row when ≤4 groups, otherwise grid
    const cols = numGroups <= 4 ? numGroups : Math.min(numGroups, Math.max(2, Math.ceil(Math.sqrt(numGroups))))
    const rows = Math.ceil(numGroups / cols)

    const legendHeight = 28
    const availableForPies = effectiveHeight - legendHeight - 8

    const cellWidth = width / cols
    const titleHeight = 24
    const cellHeight = Math.min(availableForPies / rows, cellWidth)

    // Maximize pie radius within the cell
    const chartRadius = Math.max(20, Math.min(cellWidth * 0.42, (cellHeight - titleHeight) / 2))

    // Always render as donut for modern look (respect explicit 'pie' variant)
    const isDonut = config.pieVariant !== 'pie'
    const innerRadius = isDonut ? chartRadius * 0.55 : 0

    const colors = config.colorRange ? [...config.colorRange] : [...chartTheme.palette.colors]
    const colorScale = d3.scaleOrdinal(colors)

    const textColor = chartTheme.font.axis?.color || (resolved === 'dark' ? '#e2e8f0' : '#374151')
    const bgColor = chartTheme.plot.background || chartTheme.card.background || (resolved === 'dark' ? '#1e293b' : '#ffffff')

    const svgHeight = effectiveHeight
    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', svgHeight)
      .style('overflow', 'hidden')

    const pie = d3.pie<{ label: string; value: number }>().value((d) => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(innerRadius)
      .outerRadius(chartRadius)
      .cornerRadius(isDonut ? 2 : 0)
      .padAngle(isDonut ? 0.02 : 0)

    groupKeys.forEach((groupKey, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)

      // Center the last row if it has fewer items than cols
      const itemsInRow = row < rows - 1 ? cols : numGroups - row * cols
      const rowOffset = (width - itemsInRow * cellWidth) / 2

      const cx = rowOffset + col * cellWidth + cellWidth / 2
      const cy = row * cellHeight + titleHeight + chartRadius

      const groupData = groups.get(groupKey) ?? []
      const pieData = groupData.map((d) => ({
        label: String(d[labelField] ?? ''),
        value: Math.max(0, Number(d[valueField] ?? 0)),
      })).filter((d) => d.value > 0)

      if (pieData.length === 0) return

      // Group title
      svg.append('text')
        .attr('x', cx)
        .attr('y', row * cellHeight + 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13)
        .attr('font-weight', 600)
        .attr('font-family', chartTheme.font.family)
        .attr('fill', textColor)
        .text(groupKey)

      const g = svg.append('g')
        .attr('transform', `translate(${cx},${cy})`)

      const arcs = pie(pieData)
      const total = d3.sum(pieData, (d) => d.value)

      g.selectAll('path')
        .data(arcs)
        .join('path')
        .attr('d', arc as never)
        .attr('fill', (d) => colorScale(d.data.label))
        .attr('stroke', bgColor)
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('mouseenter', function (event, d) {
          d3.select(this).attr('opacity', 0.8)
          const pct = ((d.data.value / total) * 100).toFixed(0)
          const rect = el.getBoundingClientRect()
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            text: `${d.data.label}: ${pct}%`,
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

    })

    // Color legend at bottom — collect unique labels in order
    const allLabels: string[] = []
    const labelSeen = new Set<string>()
    for (const row of data) {
      const lbl = String(row[labelField] ?? '')
      if (lbl && !labelSeen.has(lbl)) { labelSeen.add(lbl); allLabels.push(lbl) }
    }
    const legendItemWidths = allLabels.map((l) => l.length * 7.5 + 28)
    const totalLw = legendItemWidths.reduce((a, b) => a + b, 0)
    const legendY = rows * cellHeight + 24
    const legendGrp = svg.append('g')
      .attr('transform', `translate(${(width - totalLw) / 2},${legendY})`)
    let lx = 0
    allLabels.forEach((label, idx) => {
      const lg = legendGrp.append('g').attr('transform', `translate(${lx},0)`)
      lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', colorScale(label))
      lg.append('text').attr('x', 14).attr('y', 10).attr('font-size', 13)
        .attr('font-family', chartTheme.font.family).attr('fill', textColor).text(label)
      lx += legendItemWidths[idx]
    })

  }, [data, config, height, autoHeight, resolved, chartTheme, containerWidth])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return (
    <div style={{ width: '100%', position: 'relative', ...(autoHeight ? { height: '100%' } : { height }) }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            ...(tooltip.x > containerWidth * 0.6
              ? { right: containerWidth - tooltip.x + 12 }
              : { left: tooltip.x + 12 }),
            top: tooltip.y - 30,
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
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
