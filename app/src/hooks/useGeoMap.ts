/**
 * useGeoMap — shared hook for all geo map components.
 * Handles basemap loading, projection, ResizeObserver, d3-zoom, and SVG management.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import * as d3Geo from 'd3-geo'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomBehavior } from 'd3-zoom'
import type { FeatureCollection } from 'geojson'
import { loadBasemap, type BasemapId } from '../utils/geoUtils'
import { useEditorStore } from '../stores/editorStore'

export interface UseGeoMapOptions {
  basemap: string   // BasemapId or 'custom'
  projection: string // D3 projection name
  height?: number
  autoHeight?: boolean
}

export interface UseGeoMapResult {
  containerRef: React.RefObject<HTMLDivElement>
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  mapGroupRef: React.MutableRefObject<SVGGElement | null>
  geoData: FeatureCollection | null
  projectionFn: d3Geo.GeoProjection | null
  pathFn: d3Geo.GeoPath | null
  containerWidth: number
  effectiveHeight: number
  loading: boolean
  error: string | null
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleReset: () => void
}

export function useGeoMap({
  basemap,
  projection: projectionId,
  height = 400,
  autoHeight = false,
}: UseGeoMapOptions): UseGeoMapResult {
  const containerRef = useRef<HTMLDivElement>(null!)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const mapGroupRef = useRef<SVGGElement | null>(null)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const customGeoData = useEditorStore((s) => s.customGeoData)

  const basemapId = (basemap as BasemapId | 'custom') || 'world'

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

  // ResizeObserver — track both width and height
  const [containerHeight, setContainerHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
        if (autoHeight && entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [autoHeight])

  // Compute effective dimensions — in autoHeight mode, use actual container height
  const effectiveHeight = autoHeight
    ? (containerHeight > 0 ? containerHeight : Math.max(containerWidth * 0.55, 200))
    : height

  // Compute projection and path when geoData/dimensions change
  const projectionFn = (() => {
    if (!geoData || containerWidth <= 0) return null
    const projFactory = (d3Geo as Record<string, unknown>)[projectionId] as (() => d3Geo.GeoProjection) | undefined
    const proj = projFactory ? projFactory() : d3Geo.geoEqualEarth()

    const pad = 8
    if (basemap === 'world') {
      // Clip Mercator to 55°S–80°N for a clean rectangular world view
      const worldClip: GeoJSON.Feature = {
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [[[-180, -55], [180, -55], [180, 80], [-180, 80], [-180, -55]]] },
      }
      proj.fitExtent([[pad, pad], [containerWidth - pad, effectiveHeight - pad]], worldClip)
    } else {
      proj.fitExtent([[pad, pad], [containerWidth - pad, effectiveHeight - pad]], geoData)
    }
    return proj
  })()

  const pathFn = projectionFn ? d3Geo.geoPath(projectionFn) : null

  // Create SVG and zoom behavior
  useEffect(() => {
    const el = containerRef.current
    if (!el || !geoData || containerWidth <= 0) return

    const width = containerWidth
    const h = effectiveHeight

    // Clear previous render
    d3.select(el).selectAll('svg').remove()

    const svg = d3.select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', h)
      .attr('viewBox', `0 0 ${width} ${h}`)
      .style('max-width', '100%')
      .style('touch-action', 'none')
      .style('overflow', 'hidden')

    svgRef.current = svg.node()

    // Create a <g> wrapper that receives the zoom transform
    const mapGroup = svg.append('g').attr('class', 'map-group')
    mapGroupRef.current = mapGroup.node()

    // Attach d3-zoom behavior
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        mapGroup.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior
  }, [geoData, containerWidth, effectiveHeight])

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

  return {
    containerRef,
    svgRef,
    mapGroupRef,
    geoData,
    projectionFn,
    pathFn,
    containerWidth,
    effectiveHeight,
    loading,
    error,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  }
}

/** Shared zoom button style for all map components */
export const zoomBtnStyle: React.CSSProperties = {
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
