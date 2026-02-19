/**
 * Pure utility: builds a SELECT statement for the DataShaper wizard.
 * No React dependency — trivially testable.
 */

export interface ShaperConfig {
  sourceId: string
  tableName: string
  /** Columns to include. If empty, selects all (*). */
  columns: string[]
  /** Optional date-range filter. */
  dateRange?: {
    column: string
    from?: string   // ISO date string
    to?: string     // ISO date string
  }
  /** Optional aggregation. When set, overrides column selection. */
  aggregation?: {
    groupBy: string
    fn: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'
    column: string
  }
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function buildShaperSql(config: ShaperConfig): string {
  const table = `src_${config.sourceId}`

  // SELECT clause
  let select: string
  if (config.aggregation) {
    const { groupBy, fn, column } = config.aggregation
    select = `${q(groupBy)}, ${fn}(${q(column)}) AS ${q(`${fn.toLowerCase()}_${column}`)}`
  } else if (config.columns.length > 0) {
    select = config.columns.map(q).join(', ')
  } else {
    select = '*'
  }

  // WHERE clause
  const where: string[] = []
  if (config.dateRange) {
    const { column, from, to } = config.dateRange
    if (from) where.push(`${q(column)} >= '${from}'`)
    if (to) where.push(`${q(column)} <= '${to}'`)
  }

  // GROUP BY clause
  const groupBy = config.aggregation ? `GROUP BY ${q(config.aggregation.groupBy)}` : ''

  // Assemble
  const parts = [`SELECT ${select}`, `FROM ${table}`]
  if (where.length > 0) parts.push(`WHERE ${where.join(' AND ')}`)
  if (groupBy) parts.push(groupBy)

  return parts.join('\n')
}
