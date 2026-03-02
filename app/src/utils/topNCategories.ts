import type { ChartConfig, ChartType } from '../types/chart'

export const DEFAULT_MAX_CATEGORIES = 20

/** Chart types that get top-N clipping */
export const TOP_N_CHART_TYPES: ChartType[] = ['BarChart', 'StackedColumn', 'GroupedColumn']

export interface TopNResult {
  data: Record<string, unknown>[]
  totalCount: number
  clipped: boolean
  effectiveMax: number
}

/**
 * Clips data to the top N categories by y-value for bar-family charts.
 * Returns original data unchanged for other chart types or when under the limit.
 *
 * Note: clipping always selects by descending value regardless of config.sort.
 * When sort is intentionally off (user-controlled order), lower-value categories
 * are still removed silently. The source-line notice informs the reader.
 */
export function applyTopNCategories(
  data: Record<string, unknown>[],
  config: ChartConfig,
  chartType: ChartType,
): TopNResult {
  // Only apply to bar-family chart types
  if (!TOP_N_CHART_TYPES.includes(chartType)) {
    return { data, totalCount: data.length, clipped: false, effectiveMax: 0 }
  }

  const xCol = config.x

  // Bug 1 fix: handle array y by summing all y columns
  const yCols: string[] = typeof config.y === 'string'
    ? [config.y]
    : Array.isArray(config.y) ? (config.y as string[]) : []

  // Can't clip without knowing which columns to use
  if (!xCol || yCols.length === 0) {
    return { data, totalCount: data.length, clipped: false, effectiveMax: 0 }
  }

  const effectiveMax = config.maxCategories === 0
    ? 0  // explicitly disabled
    : (config.maxCategories ?? DEFAULT_MAX_CATEGORIES)

  // Find the top N categories by y-value (summing across series rows for multi-series charts)
  // For grouped/stacked: aggregate y per x-category first
  const totals = new Map<unknown, number>()
  for (const row of data) {
    const key = row[xCol]
    // Bug 1 fix: sum across all y columns
    const val = yCols.reduce((sum, col) => sum + Number(row[col] ?? 0), 0)
    totals.set(key, (totals.get(key) ?? 0) + val)
  }

  // Bug 2 fix: totalCount is distinct category count, not raw row count
  const totalCount = totals.size

  // Clipping disabled or data already within limit
  if (effectiveMax === 0 || totalCount <= effectiveMax) {
    return { data, totalCount, clipped: false, effectiveMax }
  }

  const topKeys = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, effectiveMax)
      .map(([k]) => k),
  )

  // Filter rows, preserving original order
  const sliced = data.filter((row) => topKeys.has(row[xCol]))

  // Bug 3 fix: include effectiveMax in result
  return { data: sliced, totalCount, clipped: true, effectiveMax }
}

/** Builds the category notice string to append to the source line. */
export function buildCategoryNotice(result: TopNResult): string {
  if (!result.clipped) return ''
  return `Showing top ${result.effectiveMax} of ${result.totalCount} categories`
}
