/**
 * Compute a data summary from in-memory query results for LLM context.
 */

interface ColumnSummary {
  type: string
  distinct_count: number
  null_count: number
  min?: number | string
  max?: number | string
  mean?: number
  sample_values: string[]
}

export interface DataSummary {
  row_count: number
  columns: Record<string, ColumnSummary>
  sample_rows: Record<string, unknown>[]
}

type TypeCategory = 'numeric' | 'date' | 'categorical'

function classifyType(duckdbType: string): TypeCategory {
  const t = duckdbType.toUpperCase()
  if (/INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|BIGINT|SMALLINT|TINYINT|HUGEINT/.test(t)) return 'numeric'
  if (/DATE|TIMESTAMP/.test(t)) return 'date'
  return 'categorical'
}

export function buildDataSummary(
  data: Record<string, unknown>[],
  columns: string[],
  columnTypes: Record<string, string>,
): DataSummary {
  const rowCount = data.length

  const colSummaries: Record<string, ColumnSummary> = {}

  for (const col of columns) {
    const rawType = columnTypes[col] ?? 'VARCHAR'
    const category = classifyType(rawType)
    const values = data.map((row) => row[col])

    let nullCount = 0
    const seen = new Set<string>()
    const sampleValues: string[] = []
    const numericValues: number[] = []

    for (const v of values) {
      if (v === null || v === undefined || v === '') {
        nullCount++
        continue
      }

      const str = String(v)
      if (!seen.has(str)) {
        seen.add(str)
        if (sampleValues.length < 5) {
          sampleValues.push(str)
        }
      }

      if (category === 'numeric') {
        const num = Number(v)
        if (!isNaN(num)) numericValues.push(num)
      }
    }

    const summary: ColumnSummary = {
      type: rawType,
      distinct_count: seen.size,
      null_count: nullCount,
      sample_values: sampleValues,
    }

    if (category === 'numeric' && numericValues.length > 0) {
      summary.min = Math.min(...numericValues)
      summary.max = Math.max(...numericValues)
      summary.mean = Math.round((numericValues.reduce((a, b) => a + b, 0) / numericValues.length) * 100) / 100
    } else if (category === 'date' && seen.size > 0) {
      const sorted = [...seen].sort()
      summary.min = sorted[0]
      summary.max = sorted[sorted.length - 1]
    }

    colSummaries[col] = summary
  }

  // For datasets ≤ 200 rows, include ALL rows; otherwise first 5
  const sampleRows = rowCount <= 200 ? data : data.slice(0, 5)

  return {
    row_count: rowCount,
    columns: colSummaries,
    sample_rows: sampleRows,
  }
}
