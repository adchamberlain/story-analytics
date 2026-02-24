/**
 * ChoroplethMap — D3-geo choropleth map component.
 * Renders as a non-Plot chart (like PieChart/Treemap), using D3 directly.
 * Supports zoom & pan via d3-zoom (mouse wheel, drag, pinch-to-zoom).
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import * as d3Geo from 'd3-geo'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomBehavior } from 'd3-zoom'
import type { ChartConfig } from '../../types/chart'
import {
  loadBasemap,
  joinDataToFeatures,
  BASEMAPS,
  type BasemapId,
} from '../../utils/geoUtils'
import type { FeatureCollection } from 'geojson'
import { useEditorStore } from '../../stores/editorStore'

interface ChoroplethMapProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  height?: number
  autoHeight?: boolean
}

const zoomBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1,
  border: '1px solid var(--color-border-default, #e2e8f0)',
  borderRadius: 6,
  background: 'var(--color-surface-raised, rgba(255,255,255,0.9))',
  color: 'var(--color-text-secondary, #64748b)',
  cursor: 'pointer',
  userSelect: 'none' as const,
}

export function ChoroplethMap({ data, config, height = 400, autoHeight = false }: ChoroplethMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)
  const customGeoData = useEditorStore((s) => s.customGeoData)

  const basemapId = (config.basemap as BasemapId | 'custom') || 'world'
  const joinColumn = config.geoJoinColumn || config.x
  const valueColumn = config.geoValueColumn || config.y as string || config.value
  const colorScaleType = (config.geoColorScale as 'sequential' | 'diverging') || 'sequential'
  const projectionId = config.geoProjection || BASEMAPS.find((b) => b.id === basemapId)?.defaultProjection || 'geoEqualEarth'

  // Load basemap
  useEffect(() => {
    if (basemapId === 'custom') {
      if (customGeoData) {
        setGeoData(customGeoData)
        setLoading(false)
        setError(null)
      } else {
        setLoading(false)
        setError('Upload a GeoJSON or TopoJSON file')
      }
      return
    }
    setLoading(true)
    setError(null)
    loadBasemap(basemapId)
      .then((fc) => {
        setGeoData(fc)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [basemapId, customGeoData])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Render map
  useEffect(() => {
    const el = containerRef.current
    if (!el || !geoData || containerWidth <= 0) return

    const width = containerWidth
    const h = autoHeight ? Math.max(width * 0.55, 200) : height

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

    // Projection
    const projFn = (d3Geo as Record<string, unknown>)[projectionId] as (() => d3Geo.GeoProjection) | undefined
    const projection = projFn ? projFn() : d3Geo.geoEqualEarth()

    // Fit projection to container
    projection.fitSize([width, h], geoData)

    const path = d3Geo.geoPath(projection)

    // Clear previous render
    d3.select(el).selectAll('svg').remove()

    const svg = d3.select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', h)
      .attr('viewBox', `0 0 ${width} ${h}`)
      .style('max-width', '100%')
      .style('touch-action', 'none')

    // Store ref for zoom controls
    svgRef.current = svg.node()

    // Create a <g> wrapper that receives the zoom transform
    const mapGroup = svg.append('g').attr('class', 'map-group')

    // Draw features inside the zoomable group
    mapGroup.selectAll('path')
      .data(joined)
      .join('path')
      .attr('d', (d) => path(d.feature) || '')
      .attr('fill', (d) => d.value !== null ? colorScale(d.value) : '#f0f0f0')
      .attr('stroke', 'var(--color-border-default, #e2e8f0)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', 'var(--color-text-primary, #333)').attr('stroke-width', 1.5)
        const rect = el.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          label: d.label,
          value: d.value !== null ? d3.format(',.2~f')(d.value) : 'No data',
        })
      })
      .on('mousemove', function (event) {
        const rect = el.getBoundingClientRect()
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', 'var(--color-border-default, #e2e8f0)').attr('stroke-width', 0.5)
        setTooltip(null)
      })

    // Gradient legend (outside the zoomable group so it stays fixed)
    const legendWidth = Math.min(200, width * 0.4)
    const legendHeight = 10
    const legendX = width - legendWidth - 16
    const legendY = h - 30

    // Gradient defs
    const defs = svg.append('defs')
    const gradId = `choropleth-grad-${Math.random().toString(36).slice(2, 8)}`
    const grad = defs.append('linearGradient').attr('id', gradId)
    const steps = 10
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const val = minVal + t * (maxVal - minVal)
      grad.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(val))
    }

    const legendG = svg.append('g').attr('transform', `translate(${legendX},${legendY})`)
    legendG.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('rx', 2)
      .attr('fill', `url(#${gradId})`)

    legendG.append('text')
      .attr('x', 0)
      .attr('y', legendHeight + 14)
      .attr('font-size', 10)
      .attr('fill', 'var(--color-text-secondary, #666)')
      .text(d3.format(',.2~s')(minVal))

    legendG.append('text')
      .attr('x', legendWidth)
      .attr('y', legendHeight + 14)
      .attr('text-anchor', 'end')
      .attr('font-size', 10)
      .attr('fill', 'var(--color-text-secondary, #666)')
      .text(d3.format(',.2~s')(maxVal))

    // Attach d3-zoom behavior
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        mapGroup.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior
  }, [geoData, data, containerWidth, height, autoHeight, basemapId, joinColumn, valueColumn, colorScaleType, projectionId, config.colorRange, config.color])

  // Zoom control handlers
  const handleZoomIn = useCallback(() => {
    const svgEl = svgRef.current
    const zb = zoomBehaviorRef.current
    if (!svgEl || !zb) return
    d3.select(svgEl).transition().duration(300).call(zb.scaleBy, 1.5)
  }, [])

  const handleZoomOut = useCallback(() => {
    const svgEl = svgRef.current
    const zb = zoomBehaviorRef.current
    if (!svgEl || !zb) return
    d3.select(svgEl).transition().duration(300).call(zb.scaleBy, 1 / 1.5)
  }, [])

  const handleReset = useCallback(() => {
    const svgEl = svgRef.current
    const zb = zoomBehaviorRef.current
    if (!svgEl || !zb) return
    d3.select(svgEl).transition().duration(300).call(zb.transform, zoomIdentity)
  }, [])

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
            left: tooltip.x + 12,
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
  )
}
