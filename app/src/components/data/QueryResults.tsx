import { useState, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryResultData {
  columns: string[]
  column_types: string[]
  rows: (string | number | boolean | null)[][]
  row_count: number
  truncated: boolean
  execution_time_ms: number
}

export interface QueryResultsProps {
  data: QueryResultData | null
  error: string | null
  loading?: boolean
  onChartThis: () => void
  onFixWithAi?: () => void
}

type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compareCells(a: string | number | boolean | null, b: string | number | boolean | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b))
}

function formatExecutionTime(ms: number): string {
  return (ms / 1000).toFixed(1)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortArrow({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span className="ml-1 text-text-muted opacity-0 group-hover:opacity-50">{'\u2195'}</span>
  return <span className="ml-1">{dir === 'asc' ? '\u2191' : '\u2193'}</span>
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function QueryResults({ data, error, loading, onChartThis, onFixWithAi }: QueryResultsProps) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Sort rows client-side
  const sortedRows = useMemo(() => {
    if (!data || sortCol === null) return data?.rows ?? []
    const rows = [...data.rows]
    rows.sort((a, b) => {
      const cmp = compareCells(a[sortCol], b[sortCol])
      return sortDir === 'desc' ? -cmp : cmp
    })
    return rows
  }, [data, sortCol, sortDir])

  function handleSort(colIndex: number) {
    if (sortCol === colIndex) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colIndex)
      setSortDir('asc')
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
        <Spinner />
        <span>Running query...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-red-400 font-medium mb-1">Query Error</p>
        <p className="text-sm text-red-300">{error}</p>
        {onFixWithAi && (
          <button
            onClick={onFixWithAi}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            Fix with AI
          </button>
        )}
      </div>
    )
  }

  // No data
  if (!data) return null

  return (
    <div className="flex flex-col border border-border-default rounded-lg overflow-hidden">
      {/* Truncation warning */}
      {data.truncated && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-400">
          Results limited to {data.row_count.toLocaleString()} rows
        </div>
      )}

      {/* Scrollable table */}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-secondary">
            <tr>
              {data.columns.map((col, i) => {
                const currentDir = sortCol === i ? sortDir : null
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(i)}
                    className="group cursor-pointer select-none px-4 py-2 border-b border-border-default font-semibold whitespace-nowrap text-text-primary text-xs text-left"
                  >
                    {col}
                    <SortArrow dir={currentDir} />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}>
                {row.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-1.5 border-b border-border-subtle whitespace-nowrap text-xs text-text-primary"
                  >
                    {cell === null ? (
                      <span className="italic text-text-muted">null</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-default bg-surface-secondary">
        <span className="text-xs text-text-muted">
          {data.row_count.toLocaleString()} rows ({formatExecutionTime(data.execution_time_ms)}s)
        </span>
        <button
          onClick={onChartThis}
          className="px-4 py-1.5 text-[13px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Chart this
        </button>
      </div>
    </div>
  )
}
