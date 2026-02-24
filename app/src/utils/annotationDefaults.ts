/**
 * Pure utility functions for computing data-aware annotation defaults.
 * Used by AnnotationEditor to avoid hardcoded 0 / 100 values that break
 * date-axis and non-zero-range charts.
 */

// ── Type helpers ─────────────────────────────────────────────────────────────

const TEMPORAL_TYPES = new Set([
  'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP_S',
  'TIMESTAMP_MS', 'TIMESTAMP_NS', 'TIME', 'INTERVAL',
])

const NUMERIC_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT',
  'FLOAT', 'DOUBLE', 'DECIMAL', 'UTINYINT', 'USMALLINT',
  'UINTEGER', 'UBIGINT',
])

export function isTemporalType(duckdbType: string | undefined): boolean {
  if (!duckdbType) return false
  return TEMPORAL_TYPES.has(duckdbType.toUpperCase())
}

export function isNumericType(duckdbType: string | undefined): boolean {
  if (!duckdbType) return false
  const upper = duckdbType.toUpperCase()
  return NUMERIC_TYPES.has(upper) || upper.startsWith('DECIMAL')
}

// ── Context type ─────────────────────────────────────────────────────────────

export interface AnnotationDataContext {
  data: Record<string, unknown>[]
  xColumn?: string
  yColumn?: string
  columnTypes: Record<string, string>
}

// ── X-value helpers ──────────────────────────────────────────────────────────

/** Unique x-values preserving SQL row order (for dropdowns). */
export function getXValues(data: Record<string, unknown>[], xCol: string): unknown[] {
  const seen = new Set<string>()
  const values: unknown[] = []
  for (const row of data) {
    const v = row[xCol]
    const key = String(v)
    if (!seen.has(key)) {
      seen.add(key)
      values.push(v)
    }
  }
  return values
}

/** Midpoint x-value from data. */
export function getDefaultX(ctx: AnnotationDataContext): unknown {
  if (!ctx.xColumn || ctx.data.length === 0) return 0
  const values = getXValues(ctx.data, ctx.xColumn)
  return values[Math.floor(values.length / 2)] ?? 0
}

/** Look up y from data for a given x-value. Returns undefined if not found. */
export function getYForX(
  data: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  xValue: unknown,
): number | undefined {
  const xStr = String(xValue)
  for (const row of data) {
    if (String(row[xCol]) === xStr) {
      const y = Number(row[yCol])
      return isNaN(y) ? undefined : y
    }
  }
  return undefined
}

// ── Y-range helpers ──────────────────────────────────────────────────────────

export function getYRange(
  data: Record<string, unknown>[],
  yCol: string,
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const row of data) {
    const v = Number(row[yCol])
    if (!isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!isFinite(min)) return { min: 0, max: 100 }
  return { min, max }
}

// ── Smart defaults for Reference Line ────────────────────────────────────────

export function defaultReferenceLineValue(
  ctx: AnnotationDataContext,
  axis: 'x' | 'y',
): number | string {
  if (axis === 'y' && ctx.yColumn && ctx.data.length > 0) {
    const { min, max } = getYRange(ctx.data, ctx.yColumn)
    return Math.round(((min + max) / 2) * 100) / 100
  }
  if (axis === 'x' && ctx.xColumn && ctx.data.length > 0) {
    const mid = getDefaultX(ctx)
    return mid as number | string
  }
  return 0
}

// ── Smart defaults for Highlight Range ───────────────────────────────────────

export function defaultHighlightRange(
  ctx: AnnotationDataContext,
  axis: 'x' | 'y',
): { start: number | string; end: number | string } {
  if (axis === 'y' && ctx.yColumn && ctx.data.length > 0) {
    const { min, max } = getYRange(ctx.data, ctx.yColumn)
    const mid = (min + max) / 2
    return {
      start: Math.round(mid * 100) / 100,
      end: Math.round(max * 100) / 100,
    }
  }
  if (axis === 'x' && ctx.xColumn && ctx.data.length > 0) {
    const values = getXValues(ctx.data, ctx.xColumn)
    const q3 = Math.floor(values.length * 0.75)
    return {
      start: values[q3] as number | string,
      end: values[values.length - 1] as number | string,
    }
  }
  return { start: 0, end: 100 }
}

// ── Smart position for Point Notes ───────────────────────────────────────────

import type { AnnotationPosition, PointAnnotation } from '../types/chart'

/**
 * Pick a label position that won't clip outside the chart area.
 * - Top 25% of y-range → 'below'
 * - Bottom 25% of y-range → 'above'
 * - First 15% of x-values → 'right'
 * - Last 15% of x-values → 'left'
 * - Otherwise → 'above' (the most natural default)
 *
 * Y-edge takes priority over x-edge since vertical clipping is the most
 * common issue (axis labels / title sit above the plot area).
 */
export function smartPosition(
  ctx: AnnotationDataContext,
  xValue: unknown,
  yValue: number,
): AnnotationPosition {
  // Check y-position relative to data range
  if (ctx.yColumn && ctx.data.length > 0) {
    const { min, max } = getYRange(ctx.data, ctx.yColumn)
    const range = max - min
    if (range > 0) {
      const yPct = (yValue - min) / range
      if (yPct >= 0.75) return 'below'
      if (yPct <= 0.25) return 'above'
    }
  }

  // Check x-position relative to data range (for left/right edge clipping)
  if (ctx.xColumn && ctx.data.length > 0) {
    const values = getXValues(ctx.data, ctx.xColumn)
    const xStr = String(xValue)
    const idx = values.findIndex((v) => String(v) === xStr)
    if (idx >= 0 && values.length > 1) {
      const xPct = idx / (values.length - 1)
      if (xPct <= 0.15) return 'right'
      if (xPct >= 0.85) return 'left'
    }
  }

  return 'above'
}

// ── Offset helpers for draggable point notes ─────────────────────────────────

/** Convert legacy position enum or explicit dx/dy to pixel offsets. */
export function resolveOffset(ann: Pick<PointAnnotation, 'dx' | 'dy' | 'position'>): { dx: number; dy: number } {
  if (ann.dx !== undefined || ann.dy !== undefined) {
    return { dx: ann.dx ?? 0, dy: ann.dy ?? 0 }
  }
  switch (ann.position) {
    case 'below': return { dx: 0, dy: 20 }
    case 'left':  return { dx: -20, dy: 0 }
    case 'right': return { dx: 20, dy: 0 }
    case 'above':
    default:      return { dx: 0, dy: -20 }
  }
}

/**
 * Resolve offset with responsive proportional scaling.
 * If dxRatio/dyRatio are stored, use them relative to plotWidth/plotHeight.
 * Falls back to pixel dx/dy or legacy position enum.
 */
export function resolveResponsiveOffset(
  ann: Pick<PointAnnotation, 'dx' | 'dy' | 'position'> & { dxRatio?: number; dyRatio?: number },
  plotWidth: number,
  plotHeight: number,
): { dx: number; dy: number } {
  if (ann.dxRatio !== undefined && ann.dyRatio !== undefined && plotWidth > 0 && plotHeight > 0) {
    return {
      dx: Math.round(ann.dxRatio * plotWidth),
      dy: Math.round(ann.dyRatio * plotHeight),
    }
  }
  return resolveOffset(ann)
}

/**
 * Compute proportional ratios from pixel offsets.
 * Used after drag-end to store responsive positions.
 */
export function computeRatios(
  dx: number,
  dy: number,
  plotWidth: number,
  plotHeight: number,
): { dxRatio: number; dyRatio: number } {
  if (plotWidth <= 0 || plotHeight <= 0) return { dxRatio: 0, dyRatio: 0 }
  return {
    dxRatio: dx / plotWidth,
    dyRatio: dy / plotHeight,
  }
}

/**
 * Whether annotations should collapse to footnotes at this width.
 * Below 400px, SVG annotations are replaced with text footnotes.
 */
export function shouldCollapseAnnotations(containerWidth: number): boolean {
  return containerWidth < 400
}

/** Compute smart dx/dy from data context — uses smartPosition then resolveOffset. */
export function smartOffset(
  ctx: AnnotationDataContext,
  xValue: unknown,
  yValue: number,
): { dx: number; dy: number } {
  const position = smartPosition(ctx, xValue, yValue)
  return resolveOffset({ position })
}

// ── Date formatting helper ───────────────────────────────────────────────────

/** Format a value for display in dropdowns. Dates get formatted nicely. */
export function formatXValue(value: unknown, duckdbType?: string): string {
  if (value == null) return ''
  if (isTemporalType(duckdbType) || (typeof value === 'string' && /^\d{4}-\d{2}/.test(value))) {
    const d = new Date(value as string)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
  }
  return String(value)
}
