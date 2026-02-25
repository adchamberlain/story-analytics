/**
 * ChoroplethMap — D3-geo choropleth map component.
 * Renders as a non-Plot chart (like PieChart/Treemap), using D3 directly.
 * Uses the shared useGeoMap hook for basemap loading, projection, zoom, and SVG management.
 */

import { useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { ChartConfig } from '../../types/chart'
import {
  joinDataToFeatures,
  BASEMAPS,
  type BasemapId,
} from '../../utils/geoUtils'
import { useGeoMap, zoomBtnStyle } from '../../hooks/useGeoMap'

/** Format legend value — use SI prefixes only for large numbers to avoid
 *  confusing "m" (milli) suffix on values < 1 (e.g. 0.6 → "600m"). */
function fmtLegend(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1e3) return d3.format(',.2~s')(val)
  return d3.format(',.4~g')(val)
}

interface ChoroplethMapProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  height?: number
  autoHeight?: boolean
}

export function ChoroplethMap({ data, config, height = 400, autoHeight = false }: ChoroplethMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)
  const [legendInfo, setLegendInfo] = useState<{ min: number; max: number; colors: string[] } | null>(null)

  const basemapId = (config.basemap as BasemapId | 'custom') || 'world'
  const joinColumn = config.geoJoinColumn || config.x
  const valueColumn = config.geoValueColumn || config.y as string || config.value
  const colorScaleType = (config.geoColorScale as 'sequential' | 'diverging') || 'sequential'
  const projectionId = config.geoProjection || BASEMAPS.find((b) => b.id === basemapId)?.defaultProjection || 'geoEqualEarth'

  const {
    containerRef,
    mapGroupRef,
    geoData,
    pathFn,
    containerWidth,
    effectiveHeight,
    loading,
    error,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  } = useGeoMap({ basemap: basemapId, projection: projectionId, height, autoHeight })

  // Draw filled features when geoData, data, or dimensions change
  useEffect(() => {
    const mapGroup = mapGroupRef.current
    if (!mapGroup || !geoData || !pathFn || containerWidth <= 0) return

    const mapGroupSel = d3.select(mapGroup)

    // Join data to features
    const joined = basemapId === 'custom'
      ? geoData.features.map((f) => {
          const featureId = String(f.properties?.id ?? f.id ?? f.properties?.name ?? '')
          const featureName = String(f.properties?.name ?? f.properties?.NAME ?? featureId)
          const val = Number(data.find((row) => String(row[joinColumn || '']) === featureId || String(row[joinColumn || '']) === featureName)?.[valueColumn || ''])
          return { feature: f, value: isFinite(val) ? val : null, label: featureName }
        })
      : joinDataToFeatures(geoData, data, joinColumn || '', valueColumn || '', basemapId)
    const values = joined.map((j) => j.value).filter((v): v is number => v !== null)
    const [minVal, maxVal] = values.length > 0 ? [d3.min(values)!, d3.max(values)!] : [0, 1]

    // Color scale
    const palette = config.colorRange ?? config.color
      ? [config.color || '#e0f3db', config.color || '#084081']
      : undefined

    let colorScale: (v: number) => string
    if (colorScaleType === 'diverging') {
      const mid = (minVal + maxVal) / 2
      colorScale = d3.scaleDiverging<string>()
        .domain([minVal, mid, maxVal])
        .interpolator(d3.interpolateRdYlBu)
        .unknown('#f0f0f0') as unknown as (v: number) => string
    } else {
      if (palette && palette.length >= 2) {
        colorScale = d3.scaleSequential()
          .domain([minVal, maxVal])
          .interpolator(d3.interpolateRgb(palette[0], palette[1]))
          .unknown('#f0f0f0') as unknown as (v: number) => string
      } else {
        colorScale = d3.scaleSequential()
          .domain([minVal, maxVal])
          .interpolator(d3.interpolateBlues)
          .unknown('#f0f0f0') as unknown as (v: number) => string
      }
    }

    const el = containerRef.current

    // Draw features inside the zoomable group
    mapGroupSel.selectAll('path')
      .data(joined)
      .join('path')
      .attr('d', (d) => pathFn(d.feature) || '')
      .attr('fill', (d) => d.value !== null ? colorScale(d.value) : '#f0f0f0')
      .attr('stroke', 'var(--color-border-default, #e2e8f0)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', 'var(--color-text-primary, #333)').attr('stroke-width', 1.5)
        const rect = el!.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          label: d.label,
          value: d.value !== null ? d3.format(',.2~f')(d.value) : 'No data',
        })
      })
      .on('mousemove', function (event) {
        const rect = el!.getBoundingClientRect()
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', 'var(--color-border-default, #e2e8f0)').attr('stroke-width', 0.5)
        setTooltip(null)
      })

    // Store legend info for the HTML legend rendered below the map
    const gradColors: string[] = []
    const steps = 10
    for (let i = 0; i <= steps; i++) {
      gradColors.push(colorScale(minVal + (i / steps) * (maxVal - minVal)))
    }
    setLegendInfo({ min: minVal, max: maxVal, colors: gradColors })

  }, [geoData, data, containerWidth, effectiveHeight, basemapId, joinColumn, valueColumn, colorScaleType, pathFn, config.colorRange, config.color, containerRef, mapGroupRef])

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

  const gradientCSS = legendInfo
    ? `linear-gradient(to right, ${legendInfo.colors.join(', ')})`
    : undefined

  return (
    <div style={{ width: '100%', height: autoHeight ? '100%' : height, display: 'flex', flexDirection: 'column' }}>
      {/* Map area */}
      <div ref={containerRef} style={{ width: '100%', flex: '1 1 0', minHeight: 0, position: 'relative' }}>
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
            <div style={{ opacity: 0.8 }}>{tooltip.value}</div>
          </div>
        )}
      </div>

      {/* Legend below the map */}
      {legendInfo && gradientCSS && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 2px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary, #666)', whiteSpace: 'nowrap' }}>{fmtLegend(legendInfo.min)}</span>
          <div style={{ flex: '0 1 200px', height: 8, borderRadius: 2, background: gradientCSS }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary, #666)', whiteSpace: 'nowrap' }}>{fmtLegend(legendInfo.max)}</span>
        </div>
      )}
    </div>
  )
}
