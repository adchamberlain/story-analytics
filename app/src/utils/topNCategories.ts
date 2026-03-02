import type { ChartConfig, ChartType } from '../types/chart'

export const DEFAULT_MAX_CATEGORIES = 20

/** Chart types that get top-N clipping */
export const TOP_N_CHART_TYPES: ChartType[] = ['BarChart', 'StackedColumn', 'GroupedColumn']

export interface TopNResult {
  data: Record<string, unknown>[]
  totalCount: number
  clipped: boolean
}

/**
 * Clips data to the top N categories by y-value for bar-family charts.
 * Returns original data unchanged for other chart types or when under the limit.
 */
export function applyTopNCategories(
  data: Record<string, unknown>[],
  config: ChartConfig,
  chartType: ChartType,
): TopNResult {
  const totalCount = data.length

  // Only apply to bar-family chart types
  if (!TOP_N_CHART_TYPES.includes(chartType)) {
    return { data, totalCount, clipped: false }
  }

  const xCol = config.x
  const yCol = typeof config.y === 'string' ? config.y : undefined

  // Can't clip without knowing which columns to use
  if (!xCol || !yCol) {
    return { data, totalCount, clipped: false }
  }

  const effectiveMax = config.maxCategories === 0
    ? 0  // explicitly disabled
    : (config.maxCategories ?? DEFAULT_MAX_CATEGORIES)

  // Clipping disabled or data already within limit
  if (effectiveMax === 0 || totalCount <= effectiveMax) {
    return { data, totalCount, clipped: false }
  }

  // Find the top N categories by y-value (summing across series rows for multi-series charts)
  // For grouped/stacked: aggregate y per x-category first
  const totals = new Map<unknown, number>()
  for (const row of data) {
    const key = row[xCol]
    const val = Number(row[yCol] ?? 0)
    totals.set(key, (totals.get(key) ?? 0) + val)
  }

  const topKeys = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, effectiveMax)
      .map(([k]) => k),
  )

  // Filter rows, preserving original order
  const sliced = data.filter((row) => topKeys.has(row[xCol]))

  return { data: sliced, totalCount, clipped: true }
}

/** Builds the category notice string to append to the source line. */
export function buildCategoryNotice(result: TopNResult, effectiveMax: number): string {
  if (!result.clipped) return ''
  return `Showing top ${effectiveMax} of ${result.totalCount} categories`
}
