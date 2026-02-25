import { useState, useMemo } from 'react'
import type { ChartConfig, TableColumnConfig } from '../../../types/chart'

interface RichDataTableProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

type SortDir = 'asc' | 'desc' | null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNumeric(val: unknown): boolean {
  if (val == null) return false
  if (typeof val === 'number') return true
  if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return true
  return false
}

function detectColumnType(data: Record<string, unknown>[], col: string): 'number' | 'string' {
  for (const row of data) {
    const v = row[col]
    if (v != null && v !== '') return isNumeric(v) ? 'number' : 'string'
  }
  return 'string'
}

function formatCell(value: unknown, colType: 'number' | 'string', fmt?: string): string {
  if (value == null) return ''
  if (colType === 'number' && isNumeric(value)) {
    const n = Number(value)
    if (fmt === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    if (fmt === 'percent') return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1 }).format(n)
    if (fmt === 'compact') return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n)
    return new Intl.NumberFormat('en-US').format(n)
  }
  return String(value)
}

function getNumericExtent(data: Record<string, unknown>[], col: string): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const row of data) {
    const v = Number(row[col])
    if (!isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  return [min === Infinity ? 0 : min, max === -Infinity ? 0 : max]
}

function heatmapColor(value: number, min: number, max: number, colors?: [string, string]): string {
  if (max === min) return colors?.[0] ?? 'rgba(59,130,246,0.15)'
  const t = (value - min) / (max - min)
  // Default: light blue → dark blue
  const lo = colors ?? ['rgba(59,130,246,0.08)', 'rgba(59,130,246,0.5)']
  // Simple linear interpolation using opacity
  return `color-mix(in srgb, ${lo[1]} ${Math.round(t * 100)}%, ${lo[0]})`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortIcon({ dir }: { dir: SortDir }) {
  if (!dir) return <span className="ml-1 text-text-muted opacity-0 group-hover:opacity-50">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

function SparklineSvg({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null
  const w = 60
  const h = 16
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RichDataTable({ data, config }: RichDataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  if (data.length === 0) return <p className="text-sm text-text-muted">No data</p>

  const columns = Object.keys(data[0])
  const tableColConfig = config.tableColumns ?? {}

  // Detect column types
  const colTypes = useMemo(() => {
    const types: Record<string, 'number' | 'string'> = {}
    for (const col of columns) {
      types[col] = detectColumnType(data, col)
    }
    return types
  }, [data, columns])

  // Numeric extents for heatmap/bar
  const extents = useMemo(() => {
    const e: Record<string, [number, number]> = {}
    for (const col of columns) {
      if (colTypes[col] === 'number') {
        e[col] = getNumericExtent(data, col)
      }
    }
    return e
  }, [data, columns, colTypes])

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(q)),
    )
  }, [data, search, columns])

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return filtered
    const arr = [...filtered]
    const isNum = colTypes[sortCol] === 'number'
    arr.sort((a, b) => {
      const va = a[sortCol!]
      const vb = b[sortCol!]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      let cmp: number
      if (isNum) {
        cmp = Number(va) - Number(vb)
      } else {
        cmp = String(va).localeCompare(String(vb))
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return arr
  }, [filtered, sortCol, sortDir, colTypes])

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  // Handlers
  function handleSort(col: string) {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
      setSortDir(null)
    }
    setPage(0)
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize)
    setPage(0)
  }

  // Render cell content based on column config
  function renderCell(row: Record<string, unknown>, col: string) {
    const cfg: TableColumnConfig = tableColConfig[col] ?? {}
    const value = row[col]
    const colType = colTypes[col]

    // Sparkline
    if (cfg.type === 'sparkline' && Array.isArray(value)) {
      return <SparklineSvg values={value as number[]} />
    }

    const formatted = formatCell(value, colType, cfg.format)

    // Heatmap
    if (cfg.type === 'heatmap' && colType === 'number' && isNumeric(value)) {
      const [min, max] = extents[col] ?? [0, 0]
      const bg = heatmapColor(Number(value), min, max, cfg.heatmapColors)
      return (
        <span style={{ backgroundColor: bg, padding: '2px 6px', borderRadius: 3 }}>
          {formatted}
        </span>
      )
    }

    // Bar
    if (cfg.type === 'bar' && colType === 'number' && isNumeric(value)) {
      const [min, max] = extents[col] ?? [0, 0]
      const range = max - min || 1
      const pct = ((Number(value) - min) / range) * 100
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-border-subtle rounded overflow-hidden">
            <div
              data-testid="bar-fill"
              className="h-full rounded"
              style={{
                width: `${pct}%`,
                backgroundColor: cfg.barColor ?? 'var(--color-accent)',
              }}
            />
          </div>
          <span className="text-xs tabular-nums whitespace-nowrap">{formatted}</span>
        </div>
      )
    }

    // Conditional coloring
    if (cfg.conditional && colType === 'number' && isNumeric(value)) {
      const n = Number(value)
      const color = n > 0 ? 'text-green-600' : n < 0 ? 'text-red-600' : ''
      return <span className={color}>{formatted}</span>
    }

    return formatted
  }

  const isFiltered = search.trim().length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border-default">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          className="px-2 py-1 text-xs border border-border-default rounded bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent w-48"
        />
        <span className="text-xs text-text-muted ml-auto">
          {isFiltered
            ? `${filtered.length} of ${data.length} rows`
            : `${data.length} rows`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted p-4">No matching rows</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                {columns.map((col) => {
                  const isNum = colTypes[col] === 'number'
                  const cfg = tableColConfig[col]
                  const align = cfg?.align ?? (isNum ? 'right' : 'left')
                  const currentDir = sortCol === col ? sortDir : null
                  return (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSort(col)
                        }
                      }}
                      tabIndex={0}
                      role="columnheader"
                      aria-sort={currentDir === 'asc' ? 'ascending' : currentDir === 'desc' ? 'descending' : 'none'}
                      className={`group cursor-pointer select-none px-3 py-2 border-b-2 border-border-default font-semibold text-text-primary whitespace-nowrap focus:outline-2 focus:outline-blue-500 focus:outline-offset-[-2px] ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      }`}
                      style={{ fontSize: 12 }}
                    >
                      {col}
                      <SortIcon dir={currentDir} />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row, i) => (
                <tr
                  key={i}
                  className={`${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                  } hover:bg-surface-secondary/80 transition-colors`}
                >
                  {columns.map((col) => {
                    const isNum = colTypes[col] === 'number'
                    const cfg = tableColConfig[col]
                    const align = cfg?.align ?? (isNum ? 'right' : 'left')
                    return (
                      <td
                        key={col}
                        className={`px-3 py-1.5 border-b border-border-subtle ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                        }`}
                        style={{ fontSize: 12 }}
                      >
                        {renderCell(row, col)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {sorted.length > 10 && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-border-default text-xs text-text-muted">
          <button
            aria-label="Prev"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="px-2 py-1 border border-border-default rounded disabled:opacity-30 hover:bg-surface-secondary"
          >
            ← Prev
          </button>
          <span>
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            aria-label="Next"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
            className="px-2 py-1 border border-border-default rounded disabled:opacity-30 hover:bg-surface-secondary"
          >
            Next →
          </button>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="ml-auto px-1 py-0.5 border border-border-default rounded bg-surface text-text-primary"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      )}
    </div>
  )
}
