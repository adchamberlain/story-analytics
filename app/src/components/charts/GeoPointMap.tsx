/**
 * GeoPointMap — renders Symbol, Locator, or Spike maps on a geographic basemap.
 * Uses the shared useGeoMap hook for basemap loading, projection, zoom, and SVG management.
 */

import { useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { ChartConfig } from '../../types/chart'
import { BASEMAPS, type BasemapId } from '../../utils/geoUtils'
import { useGeoMap, zoomBtnStyle } from '../../hooks/useGeoMap'
import { detectUnitFromTitleSubtitle, fmtWithUnit } from '../../utils/formatters'

export interface GeoPointMapProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  height?: number
  autoHeight?: boolean
  mapVariant: 'symbol' | 'locator' | 'spike'
}

export function GeoPointMap({ data, config, height = 400, autoHeight = false, mapVariant }: GeoPointMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)

  const basemapId = (config.basemap as BasemapId | 'custom') || 'world'
  const projectionId = config.geoProjection || BASEMAPS.find((b) => b.id === basemapId)?.defaultProjection || 'geoEqualEarth'
  const latColumn = config.geoLatColumn
  const lonColumn = config.geoLonColumn
  const sizeColumn = config.geoSizeColumn
  const labelColumn = config.geoLabelColumn
  const sizeRange = config.geoSizeRange ?? [3, 25]

  const {
    containerRef,
    mapGroupRef,
    geoData,
    pathFn,
    projectionFn,
    containerWidth,
    effectiveHeight,
    loading,
    error,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  } = useGeoMap({ basemap: basemapId, projection: projectionId, height, autoHeight })

  // Draw basemap background + point data
  useEffect(() => {
    const mapGroup = mapGroupRef.current
    if (!mapGroup || !geoData || !pathFn || !projectionFn || containerWidth <= 0) return

    const mapGroupSel = d3.select(mapGroup)

    // Clear previous content
    mapGroupSel.selectAll('*').remove()

    // Draw gray basemap background
    mapGroupSel.selectAll('path.basemap')
      .data(geoData.features)
      .join('path')
      .attr('class', 'basemap')
      .attr('d', (f) => pathFn(f) || '')
      .attr('fill', '#e8e8e8')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 0.5)

    // Project data points
    if (!latColumn || !lonColumn) return

    // Auto-detect a label column if not explicitly configured
    const effectiveLabelCol = labelColumn || (() => {
      if (data.length === 0) return undefined
      const reserved = new Set([latColumn, lonColumn, sizeColumn].filter(Boolean))
      const keys = Object.keys(data[0])
      // Prefer columns with string content that aren't lat/lon/size
      return keys.find((k) => !reserved.has(k) && typeof data[0][k] === 'string')
        ?? keys.find((k) => !reserved.has(k) && typeof data[0][k] !== 'number')
    })()

    // Detect units from title/subtitle for tooltip formatting
    const unit = detectUnitFromTitleSubtitle(config.title, config.extraProps?.subtitle as string | undefined)

    const points = data
      .map((row) => {
        const lat = Number(row[latColumn])
        const lon = Number(row[lonColumn])
        if (!isFinite(lat) || !isFinite(lon)) return null
        const projected = projectionFn([lon, lat])
        if (!projected) return null
        const sizeVal = sizeColumn ? Number(row[sizeColumn]) : null
        const labelVal = effectiveLabelCol ? String(row[effectiveLabelCol] ?? '') : ''
        return {
          x: projected[0],
          y: projected[1],
          sizeVal: sizeVal !== null && isFinite(sizeVal) ? sizeVal : null,
          label: labelVal,
          row,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    const el = containerRef.current

    // Palette color
    const color = config.colorRange?.[0] ?? config.color ?? '#3b82f6'

    if (mapVariant === 'symbol') {
      // Symbol map: sized circles
      const sizeValues = points.map((p) => p.sizeVal).filter((v): v is number => v !== null)
      const sizeExtent = sizeValues.length > 0 ? [d3.min(sizeValues)!, d3.max(sizeValues)!] : [0, 1]
      const radiusScale = d3.scaleSqrt().domain(sizeExtent).range(sizeRange)

      mapGroupSel.selectAll('circle.symbol')
        .data(points)
        .join('circle')
        .attr('class', 'symbol')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', (d) => d.sizeVal !== null ? radiusScale(d.sizeVal) : sizeRange[0])
        .attr('fill', color)
        .attr('fill-opacity', 0.6)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('mouseenter', function (event, d) {
          d3.select(this).attr('fill-opacity', 0.9).attr('stroke-width', 1.5)
          const rect = el!.getBoundingClientRect()
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            label: d.label || `${d.row[latColumn]}, ${d.row[lonColumn]}`,
            value: d.sizeVal !== null ? fmtWithUnit(d3.format(',.2~f')(d.sizeVal), unit) : '',
          })
        })
        .on('mousemove', function (event) {
          const rect = el!.getBoundingClientRect()
          setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
        })
        .on('mouseleave', function () {
          d3.select(this).attr('fill-opacity', 0.6).attr('stroke-width', 0.5)
          setTooltip(null)
        })

    } else if (mapVariant === 'locator') {
      // Locator map: pin markers with labels
      const pinGroup = mapGroupSel.selectAll('g.pin')
        .data(points)
        .join('g')
        .attr('class', 'pin')
        .attr('transform', (d) => `translate(${d.x},${d.y})`)
        .style('cursor', 'pointer')

      // Invisible hit area so the entire pin region triggers events reliably
      pinGroup.append('rect')
        .attr('x', -10)
        .attr('y', -16)
        .attr('width', 20)
        .attr('height', 28)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')

      // Pin icon (teardrop shape)
      pinGroup.append('path')
        .attr('d', 'M0,-12 C-4,-12 -7,-8 -7,-5 C-7,0 0,8 0,8 S7,0 7,-5 C7,-8 4,-12 0,-12Z')
        .attr('fill', color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('pointer-events', 'none')

      // Inner dot
      pinGroup.append('circle')
        .attr('cx', 0)
        .attr('cy', -5)
        .attr('r', 2.5)
        .attr('fill', '#fff')
        .attr('pointer-events', 'none')

      // Labels (initial position — collision pass repositions below)
      pinGroup.append('text')
        .attr('x', 10)
        .attr('y', -4)
        .attr('font-size', 10)
        .attr('fill', 'var(--color-text-primary, #333)')
        .attr('font-weight', 500)
        .attr('pointer-events', 'none')
        .text((d) => d.label)

      // Resolve label collisions — greedy placement with 4 candidate positions
      const candidates = [
        { dx: 10, dy: -4, anchor: 'start' },   // right (default)
        { dx: -10, dy: -4, anchor: 'end' },     // left
        { dx: 0, dy: -20, anchor: 'middle' },   // above
        { dx: 0, dy: 16, anchor: 'middle' },    // below
      ]
      const PAD = 4
      const placed: { x: number; y: number; w: number; h: number }[] = []
      const TEXT_H = 12 // approx line height for font-size 10

      const textNodes = pinGroup.selectAll('text').nodes() as SVGTextElement[]
      for (const textEl of textNodes) {
        const g = textEl.parentNode as SVGGElement
        const transform = g.getAttribute('transform') || ''
        const m = transform.match(/translate\(\s*([\d.e+-]+)\s*,\s*([\d.e+-]+)\s*\)/)
        if (!m) continue
        const pinX = parseFloat(m[1])
        const pinY = parseFloat(m[2])
        const textW = textEl.getComputedTextLength() || 40

        let fitted = false
        for (const c of candidates) {
          // Compute bounding rect in SVG coordinate space
          let rx: number
          if (c.anchor === 'end') rx = pinX + c.dx - textW
          else if (c.anchor === 'middle') rx = pinX + c.dx - textW / 2
          else rx = pinX + c.dx
          const ry = pinY + c.dy - TEXT_H
          const rect = { x: rx, y: ry, w: textW, h: TEXT_H }

          const overlaps = placed.some(
            (p) => rect.x < p.x + p.w + PAD && rect.x + rect.w + PAD > p.x &&
                   rect.y < p.y + p.h + PAD && rect.y + rect.h + PAD > p.y,
          )
          if (!overlaps) {
            textEl.setAttribute('x', String(c.dx))
            textEl.setAttribute('y', String(c.dy))
            textEl.setAttribute('text-anchor', c.anchor)
            placed.push(rect)
            fitted = true
            break
          }
        }
        if (!fitted) {
          textEl.setAttribute('visibility', 'hidden')
        }
      }

      pinGroup
        .on('mouseenter', function (event, d) {
          const rect = el!.getBoundingClientRect()
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            label: d.label || `${d.row[latColumn]}, ${d.row[lonColumn]}`,
            value: '',
          })
        })
        .on('mousemove', function (event) {
          const rect = el!.getBoundingClientRect()
          setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
        })
        .on('mouseleave', function () {
          setTooltip(null)
        })

    } else if (mapVariant === 'spike') {
      // Spike map: tapered triangular spikes, height proportional to value
      const sizeValues = points.map((p) => p.sizeVal).filter((v): v is number => v !== null)
      const sizeExtent = sizeValues.length > 0 ? [d3.min(sizeValues)!, d3.max(sizeValues)!] : [0, 1]
      const maxSpikeHeight = Math.min(effectiveHeight * 0.3, 80)
      const heightScale = d3.scaleLinear().domain(sizeExtent).range([6, maxSpikeHeight])

      // Sort large spikes behind small ones so dense areas stay readable
      const sorted = [...points].sort((a, b) => (b.sizeVal ?? 0) - (a.sizeVal ?? 0))

      // Derive a darker stroke color for contrast
      const strokeColor = d3.color(color)?.darker(0.6)?.formatHex() ?? color

      mapGroupSel.selectAll('path.spike')
        .data(sorted)
        .join('path')
        .attr('class', 'spike')
        .attr('d', (d) => {
          const h = d.sizeVal !== null ? heightScale(d.sizeVal) : 6
          const w = Math.max(2, h * 0.08)
          return `M${d.x},${d.y} L${d.x - w},${d.y} L${d.x},${d.y - h} L${d.x + w},${d.y} Z`
        })
        .attr('fill', color)
        .attr('fill-opacity', 0.5)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('mouseenter', function (event, d) {
          d3.select(this).attr('fill-opacity', 1).attr('stroke-width', 1.5)
          const rect = el!.getBoundingClientRect()
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            label: d.label || `${d.row[latColumn]}, ${d.row[lonColumn]}`,
            value: d.sizeVal !== null ? fmtWithUnit(d3.format(',.2~f')(d.sizeVal), unit) : '',
          })
        })
        .on('mousemove', function (event) {
          const rect = el!.getBoundingClientRect()
          setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
        })
        .on('mouseleave', function () {
          d3.select(this).attr('fill-opacity', 0.7).attr('stroke-width', 0.5)
          setTooltip(null)
        })
    }
  }, [geoData, data, containerWidth, effectiveHeight, pathFn, projectionFn, latColumn, lonColumn, sizeColumn, labelColumn, mapVariant, config.colorRange, config.color, sizeRange, containerRef, mapGroupRef])

  return (
    <div ref={containerRef} onMouseLeave={() => setTooltip(null)} style={{ width: '100%', height: autoHeight ? '100%' : height, position: 'relative', overflow: 'hidden' }}>
      {/* Loading / error overlays */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading map...</span>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--color-red-500, red)' }}>Map error: {error}</span>
        </div>
      )}

      {/* Zoom controls */}
      {!loading && !error && (
        <div
          data-testid="zoom-controls"
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 5 }}
        >
          <button onClick={handleZoomIn} style={zoomBtnStyle} aria-label="Zoom in">+</button>
          <button onClick={handleZoomOut} style={zoomBtnStyle} aria-label="Zoom out">-</button>
          <button onClick={handleReset} style={{ ...zoomBtnStyle, fontSize: 10 }} aria-label="Reset zoom">Reset</button>
        </div>
      )}

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
          <div style={{ fontWeight: 600 }}>{tooltip.label}</div>
          {tooltip.value && <div style={{ opacity: 0.8 }}>{tooltip.value}</div>}
        </div>
      )}
    </div>
  )
}
