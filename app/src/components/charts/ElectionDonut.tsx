import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { useThemeStore } from '../../stores/themeStore'
import { useChartThemeStore } from '../../stores/chartThemeStore'
import type { ChartConfig } from '../../types/chart'

interface ElectionDonutProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  height: number
  autoHeight?: boolean
}

/**
 * Election-style hemicycle (semicircular parliament) chart.
 * Seats are arranged in concentric semicircular rows, colored by party/group.
 * Data format: each row represents a group with a label and seat count.
 */
export function ElectionDonut({ data, config, height, autoHeight }: ElectionDonutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
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

    el.innerHTML = ''

    if (data.length === 0) return

    const keys = Object.keys(data[0])
    const labelField = config.x ?? keys[0]
    const valueField = (config.value ?? config.y ?? keys[1]) as string | undefined
    if (!valueField) return

    const width = containerWidth || el.clientWidth
    const effectiveHeight = autoHeight ? el.clientHeight : height
    if (width <= 0 || effectiveHeight <= 0) return

    // Build party data
    const parties = data.map((d) => ({
      label: String(d[labelField] ?? ''),
      seats: Math.max(0, Math.round(Number(d[valueField] ?? 0))),
    })).filter((d) => d.seats > 0)

    if (parties.length === 0) return

    const totalSeats = d3.sum(parties, (d) => d.seats)
    const colors = config.colorRange ? [...config.colorRange] : [...chartTheme.palette.colors]
    const colorScale = d3.scaleOrdinal(colors)

    // Arrange seats in semicircular rows
    const seats = layoutHemicycle(parties, totalSeats)

    const radius = Math.min(width / 2 - 20, effectiveHeight - 40)
    if (radius <= 0) return

    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', effectiveHeight)

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${effectiveHeight - 10})`)

    const textColor = resolved === 'dark' ? '#e2e8f0' : '#374151'

    // Draw seat dots
    g.selectAll('circle.seat')
      .data(seats)
      .join('circle')
      .attr('class', 'seat')
      .attr('cx', (d) => d.x * radius)
      .attr('cy', (d) => d.y * radius)
      .attr('r', Math.max(2, Math.min(8, radius / (Math.sqrt(totalSeats) * 1.2))))
      .attr('fill', (d) => colorScale(d.party))

    // Legend below
    const legendG = svg.append('g')
      .attr('transform', `translate(${width / 2},${effectiveHeight - 4})`)

    let legendX = -(parties.length * 60) / 2

    parties.forEach((p, i) => {
      const lg = legendG.append('g')
        .attr('transform', `translate(${legendX},0)`)

      lg.append('rect')
        .attr('width', 10)
        .attr('height', 10)
        .attr('rx', 2)
        .attr('fill', colorScale(p.label))

      lg.append('text')
        .attr('x', 14)
        .attr('y', 9)
        .attr('font-size', 10)
        .attr('font-family', chartTheme.font.family)
        .attr('fill', textColor)
        .text(`${p.label} (${p.seats})`)

      legendX += Math.max(60, p.label.length * 7 + 40 + String(p.seats).length * 6)
      void i
    })

    // Total seats label at the center bottom
    g.append('text')
      .attr('x', 0)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', 16)
      .attr('font-weight', 'bold')
      .attr('font-family', chartTheme.font.family)
      .attr('fill', textColor)
      .text(String(totalSeats))

  }, [data, config, height, autoHeight, resolved, chartTheme, containerWidth])

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>
  return <div ref={containerRef} style={{ width: '100%', ...(autoHeight ? { height: '100%' } : { height }) }} />
}

interface SeatPosition {
  x: number
  y: number
  party: string
}

/**
 * Lay out seats in concentric semicircular rows.
 * Returns normalized positions where radius=1 maps to the outer edge.
 */
function layoutHemicycle(
  parties: { label: string; seats: number }[],
  totalSeats: number,
): SeatPosition[] {
  const seats: SeatPosition[] = []

  // Determine number of rows based on total seats
  const numRows = Math.max(2, Math.ceil(Math.sqrt(totalSeats / 4)))
  const innerRadius = 0.35
  const outerRadius = 0.95

  // Distribute seats across rows (more seats in outer rows)
  const rowSeats: number[] = []
  let allocated = 0
  for (let r = 0; r < numRows; r++) {
    const rowRadius = innerRadius + (outerRadius - innerRadius) * (r / (numRows - 1))
    const seatsInRow = Math.round((rowRadius / outerRadius) * (totalSeats / numRows) * 1.5)
    rowSeats.push(seatsInRow)
    allocated += seatsInRow
  }

  // Adjust to match total
  const scale = totalSeats / Math.max(1, allocated)
  let remaining = totalSeats
  for (let r = 0; r < numRows; r++) {
    if (r === numRows - 1) {
      rowSeats[r] = remaining
    } else {
      rowSeats[r] = Math.round(rowSeats[r] * scale)
      remaining -= rowSeats[r]
    }
  }

  // Flatten parties into an ordered array of party labels per seat
  const partyLabels: string[] = []
  for (const p of parties) {
    for (let i = 0; i < p.seats; i++) {
      partyLabels.push(p.label)
    }
  }

  // Place seats row by row
  let seatIdx = 0
  for (let r = 0; r < numRows && seatIdx < totalSeats; r++) {
    const rowRadius = innerRadius + (outerRadius - innerRadius) * (r / Math.max(1, numRows - 1))
    const count = Math.min(rowSeats[r], totalSeats - seatIdx)
    const padding = Math.PI * 0.03

    for (let s = 0; s < count && seatIdx < totalSeats; s++) {
      const angle = padding + (Math.PI - 2 * padding) * (s / Math.max(1, count - 1))
      seats.push({
        x: -Math.cos(angle) * rowRadius,
        y: -Math.sin(angle) * rowRadius,
        party: partyLabels[seatIdx],
      })
      seatIdx++
    }
  }

  return seats
}
