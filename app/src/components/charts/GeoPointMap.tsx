/**
 * GeoPointMap — renders Symbol, Locator, or Spike maps on a geographic basemap.
 * Uses the shared useGeoMap hook for basemap loading, projection, zoom, and SVG management.
 */

import { useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { ChartConfig } from '../../types/chart'
import { BASEMAPS, type BasemapId } from '../../utils/geoUtils'
import { useGeoMap, zoomBtnStyle } from '../../hooks/useGeoMap'

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

    const points = data
      .map((row) => {
        const lat = Number(row[latColumn])
        const lon = Number(row[lonColumn])
        if (!isFinite(lat) || !isFinite(lon)) return null
        const projected = projectionFn([lon, lat])
        if (!projected) return null
        const sizeVal = sizeColumn ? Number(row[sizeColumn]) : null
        const labelVal = labelColumn ? String(row[labelColumn] ?? '') : ''
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
            value: d.sizeVal !== null ? d3.format(',.2~f')(d.sizeVal) : '',
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

      // Pin icon (teardrop shape)
      pinGroup.append('path')
        .attr('d', 'M0,-12 C-4,-12 -7,-8 -7,-5 C-7,0 0,8 0,8 S7,0 7,-5 C7,-8 4,-12 0,-12Z')
        .attr('fill', color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)

      // Inner dot
      pinGroup.append('circle')
        .attr('cx', 0)
        .attr('cy', -5)
        .attr('r', 2.5)
        .attr('fill', '#fff')

      // Labels
      pinGroup.append('text')
        .attr('x', 10)
        .attr('y', -4)
        .attr('font-size', 10)
        .attr('fill', 'var(--color-text-primary, #333)')
        .attr('font-weight', 500)
        .text((d) => d.label)

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
            value: d.sizeVal !== null ? d3.format(',.2~f')(d.sizeVal) : '',
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

  if (loading) {
    return (
      <div ref={containerRef} style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading map...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={containerRef} style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--color-red-500, red)' }}>Map error: {error}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: autoHeight ? '100%' : height, position: 'relative' }}>
      {/* Zoom controls */}
      <div
        data-testid="zoom-controls"
        style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 5 }}
      >
        <button onClick={handleZoomIn} style={zoomBtnStyle} aria-label="Zoom in">+</button>
        <button onClick={handleZoomOut} style={zoomBtnStyle} aria-label="Zoom out">-</button>
        <button onClick={handleReset} style={{ ...zoomBtnStyle, fontSize: 10 }} aria-label="Reset zoom">Reset</button>
      </div>

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
