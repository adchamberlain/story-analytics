export function shouldShowGrid(
  rowCount: number,
  metricLabel: string | undefined,
): boolean {
  return rowCount > 1 && !!metricLabel
}

export function formatBigValue(
  value: unknown,
  format: 'currency' | 'percent' | 'number' | undefined,
): string {
  if (value == null) return '—'
  if (typeof value !== 'number') return String(value)
  if (format === 'currency') return `$${value.toLocaleString()}`
  if (format === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}
