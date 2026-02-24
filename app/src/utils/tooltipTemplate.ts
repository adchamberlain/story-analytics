/**
 * Tooltip template engine.
 * Supports {{ column }} and {{ column | format }} syntax.
 * Available formats: currency, percent, compact, number.
 */

import { formatCurrency, formatPercent, formatCompact, formatNumber } from './formatters'

const TEMPLATE_RE = /\{\{\s*(\w+)(?:\s*\|\s*(\w+))?\s*\}\}/g

/**
 * Render a tooltip template with data from a row.
 *
 * @param template - Template string with {{ column }} or {{ column | format }} placeholders
 * @param row - Data row as key-value pairs
 * @returns Rendered string with values substituted
 */
export function renderTooltip(
  template: string,
  row: Record<string, unknown>,
): string {
  return template.replace(TEMPLATE_RE, (_, col: string, fmt?: string) => {
    const val = row[col]
    if (val == null) return ''

    if (fmt === 'currency') return formatCurrency(Number(val))
    if (fmt === 'percent') return formatPercent(Number(val))
    if (fmt === 'compact') return formatCompact(Number(val))
    if (fmt === 'number') return formatNumber(Number(val))

    return String(val)
  })
}
