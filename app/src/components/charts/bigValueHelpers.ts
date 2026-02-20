export function shouldShowGrid(
  rowCount: number,
  metricLabel: string | undefined,
): boolean {
  return rowCount > 1 && !!metricLabel
}

/**
 * Map a unit string from the data (e.g. "USD", "percent") to a format hint.
 * Returns undefined if the unit is unrecognized (falls through to global format).
 */
export function unitToFormat(unit: unknown): 'currency' | 'percent' | 'number' | undefined {
  if (unit == null || typeof unit !== 'string') return undefined
  const u = unit.toLowerCase().trim()
  if (u === 'usd' || u === '$' || u === 'dollar' || u === 'dollars' || u === 'currency') return 'currency'
  if (u === 'percent' || u === '%' || u === 'pct' || u === 'percentage') return 'percent'
  if (u === 'count' || u === 'number' || u === 'score' || u === 'units' || u === '') return 'number'
  return undefined
}

export function formatBigValue(
  value: unknown,
  format: 'currency' | 'percent' | 'number' | undefined,
  /** Per-row unit string (e.g. "USD", "percent"). Overrides format when present. */
  unit?: unknown,
): string {
  if (value == null) return '—'
  if (typeof value !== 'number') return String(value)
  // Per-row unit overrides global format
  const effectiveFormat = unitToFormat(unit) ?? format
  if (effectiveFormat === 'currency') return `$${value.toLocaleString()}`
  if (effectiveFormat === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}

/**
 * Compute percentage delta: ((value - comparison) / comparison) * 100.
 * Returns null if either value is not a valid number or comparison is zero.
 */
export function computePctDelta(value: unknown, compValue: unknown): number | null {
  if (typeof value !== 'number' || typeof compValue !== 'number') return null
  if (compValue === 0) return null
  return ((value - compValue) / compValue) * 100
}

/**
 * Format a percentage delta for display: "+7.0%" or "-5.0%"
 */
export function formatDelta(pctDelta: number): string {
  const sign = pctDelta >= 0 ? '+' : ''
  return `${sign}${pctDelta.toFixed(1)}%`
}
