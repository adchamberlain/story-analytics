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

    // Grid layout: determine columns and rows
    const cols = Math.min(numGroups, Math.max(2, Math.ceil(Math.sqrt(numGroups))))
    const rows = Math.ceil(numGroups / cols)

    const cellWidth = width / cols
    const titleHeight = 24
    const cellHeight = Math.min((effectiveHeight - 10) / rows, cellWidth)

    const legendHeight = 24
    // Reserve space for legend within effective height
    const availableForPies = effectiveHeight - legendHeight - 8
    const actualCellHeight = Math.min(cellHeight, availableForPies / rows)
    const chartRadius = Math.max(15, Math.min(cellWidth, actualCellHeight - titleHeight) / 2 - 6)

    const isDonut = config.pieVariant === 'donut'
    const innerRadius = isDonut ? chartRadius * 0.5 : 0

    const colors = config.colorRange ? [...config.colorRange] : [...chartTheme.palette.colors]
    const colorScale = d3.scaleOrdinal(colors)

    const textColor = resolved === 'dark' ? '#e2e8f0' : '#374151'
    const sliceStroke = resolved === 'dark' ? '#1e293b' : '#ffffff'

    const svgHeight = effectiveHeight
    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', svgHeight)

    const pie = d3.pie<{ label: string; value: number }>().value((d) => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(innerRadius)
      .outerRadius(chartRadius)

    groupKeys.forEach((groupKey, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)

      const cx = col * cellWidth + cellWidth / 2
      const cy = row * actualCellHeight + titleHeight + chartRadius

      const groupData = groups.get(groupKey) ?? []
      const pieData = groupData.map((d) => ({
        label: String(d[labelField] ?? ''),
        value: Math.max(0, Number(d[valueField] ?? 0)),
      })).filter((d) => d.value > 0)

      if (pieData.length === 0) return

      // Group title
      svg.append('text')
        .attr('x', cx)
        .attr('y', row * actualCellHeight + 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', 14)
        .attr('font-weight', 600)
        .attr('font-family', chartTheme.font.family)
        .attr('fill', textColor)
        .text(groupKey)

      const g = svg.append('g')
        .attr('transform', `translate(${cx},${cy})`)

      const arcs = pie(pieData)

      g.selectAll('path')
        .data(arcs)
        .join('path')
        .attr('d', arc as never)
        .attr('fill', (d) => colorScale(d.data.label))
        .attr('stroke', sliceStroke)
        .attr('stroke-width', 1)

      // Internal percentage labels (only if large enough)
      const labelArc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
        .innerRadius(chartRadius * 0.6)
        .outerRadius(chartRadius * 0.6)

      const total = d3.sum(pieData, (d) => d.value)

      if (chartRadius >= 30) {
        g.selectAll('text.label')
          .data(arcs)
          .join('text')
          .attr('class', 'label')
          .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', 12)
          .attr('font-weight', 500)
          .attr('font-family', chartTheme.font.family)
          .attr('fill', textColor)
          .text((d) => {
            const pct = (d.data.value / total) * 100
            return pct >= 5 ? `${pct.toFixed(0)}%` : ''
          })
      }
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
    const legendY = rows * actualCellHeight + 6
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
  return <div ref={containerRef} style={{ width: '100%', ...(autoHeight ? { height: '100%' } : { height }) }} />
}
