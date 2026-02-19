import { useState, useMemo } from 'react'
import { buildShaperSql, type ShaperConfig } from '../../utils/buildShaperSql'
import type { SyncedColumnInfo } from './DatabaseConnector'

interface DataShaperProps {
  sourceId: string
  tableName: string
  rowCount: number
  columns: SyncedColumnInfo[]
  onApprove: (sql: string) => void
  onSkip: () => void
  onBack: () => void
}

type AggFn = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'

function isNumericType(type: string): boolean {
  const t = type.toUpperCase()
  return ['INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'HUGEINT'].some(
    (n) => t.includes(n),
  )
}

function isDateType(type: string): boolean {
  const t = type.toUpperCase()
  return t.includes('DATE') || t.includes('TIMESTAMP') || t.includes('TIME')
}

export function DataShaper({ sourceId, tableName, rowCount, columns, onApprove, onSkip, onBack }: DataShaperProps) {
  // Column selection — all checked by default
  const [selected, setSelected] = useState<Set<string>>(() => new Set(columns.map((c) => c.name)))

  // Date range filter
  const dateColumns = columns.filter((c) => isDateType(c.type))
  const [dateColumn, setDateColumn] = useState<string>(dateColumns[0]?.name ?? '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Aggregation
  const [aggEnabled, setAggEnabled] = useState(false)
  const numericColumns = columns.filter((c) => isNumericType(c.type))
  const nonNumericColumns = columns.filter((c) => !isNumericType(c.type))
  const [aggGroupBy, setAggGroupBy] = useState(nonNumericColumns[0]?.name ?? '')
  const [aggFn, setAggFn] = useState<AggFn>('SUM')
  const [aggColumn, setAggColumn] = useState(numericColumns[0]?.name ?? '')

  // Preview state
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Build SQL
  const shaperConfig = useMemo<ShaperConfig>(() => {
    const cfg: ShaperConfig = {
      sourceId,
      tableName,
      columns: [...selected],
    }
    if (dateColumn && (dateFrom || dateTo)) {
      cfg.dateRange = { column: dateColumn, from: dateFrom || undefined, to: dateTo || undefined }
    }
    if (aggEnabled && aggGroupBy && aggColumn) {
      cfg.aggregation = { groupBy: aggGroupBy, fn: aggFn, column: aggColumn }
    }
    return cfg
  }, [sourceId, tableName, selected, dateColumn, dateFrom, dateTo, aggEnabled, aggGroupBy, aggFn, aggColumn])

  const sql = useMemo(() => buildShaperSql(shaperConfig), [shaperConfig])

  const toggleColumn = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === columns.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(columns.map((c) => c.name)))
    }
  }

  const handlePreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/data/query-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `${sql}\nLIMIT 50` }),
      })
      const data = await res.json()
      if (!data.success) {
        setPreviewError(data.error ?? 'Query failed')
        setPreview(null)
      } else {
        setPreview({ columns: data.columns, rows: data.rows })
      }
    } catch (e) {
      setPreviewError(String(e))
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const selectClass =
    'w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400'
  const inputClass =
    'w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400'

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div className="flex items-center gap-3" style={{ marginBottom: '4px' }}>
          <button onClick={onBack} className="text-[14px] text-text-secondary hover:text-text-primary transition-colors">
            &larr; Back
          </button>
        </div>
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight" style={{ marginBottom: '4px' }}>
          Shape your data
        </h1>
        <p className="text-[15px] text-text-muted">
          {tableName} &middot; {rowCount.toLocaleString()} rows &middot; {columns.length} columns
        </p>
        <button onClick={onSkip} className="text-[14px] text-blue-500 hover:text-blue-600 mt-1 transition-colors">
          Skip — use all data
        </button>
      </div>

      {/* Column Selection */}
      <div style={{ marginBottom: '24px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
          <h3 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">Columns</h3>
          <button onClick={toggleAll} className="text-[12px] text-blue-500 hover:text-blue-600">
            {selected.size === columns.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="border border-border-default rounded-lg overflow-hidden">
          {columns.map((col) => (
            <label
              key={col.name}
              className={`flex items-center gap-3 px-3 py-2 border-b border-border-default last:border-b-0 cursor-pointer hover:bg-surface-secondary/50 transition-colors ${
                aggEnabled ? 'opacity-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(col.name)}
                onChange={() => toggleColumn(col.name)}
                disabled={aggEnabled}
                className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[14px] text-text-primary flex-1">{col.name}</span>
              <span className="text-[11px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-secondary">
                {col.type}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Date Range Filter */}
      {dateColumns.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider" style={{ marginBottom: '8px' }}>
            Date Range
          </h3>
          <div className="space-y-2">
            <select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} className={selectClass}>
              {dateColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.min_value ?? '?'} to {c.max_value ?? '?'})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
                className={inputClass}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Aggregation */}
      {numericColumns.length > 0 && nonNumericColumns.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <label className="flex items-center gap-2 cursor-pointer" style={{ marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={aggEnabled}
              onChange={(e) => setAggEnabled(e.target.checked)}
              className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">Aggregation</span>
          </label>
          {aggEnabled && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Group by</label>
                <select value={aggGroupBy} onChange={(e) => setAggGroupBy(e.target.value)} className={selectClass}>
                  {nonNumericColumns.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Function</label>
                <select value={aggFn} onChange={(e) => setAggFn(e.target.value as AggFn)} className={selectClass}>
                  {(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'] as const).map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Column</label>
                <select value={aggColumn} onChange={(e) => setAggColumn(e.target.value)} className={selectClass}>
                  {numericColumns.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SQL Preview */}
      <div style={{ marginBottom: '24px' }}>
        <h3 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider" style={{ marginBottom: '8px' }}>
          SQL Preview
        </h3>
        <pre className="text-[12px] font-mono text-text-primary bg-surface-secondary border border-border-default rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {sql}
        </pre>
      </div>

      {/* Preview Button + Results */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="text-[14px] font-medium text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          {previewLoading ? 'Running...' : 'Preview results'}
        </button>
        {previewError && (
          <p className="text-[13px] text-red-500 mt-2">{previewError}</p>
        )}
        {preview && (
          <div className="mt-3 border border-border-default rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
              <table className="w-full text-[12px] font-mono">
                <thead>
                  <tr className="bg-surface-secondary sticky top-0">
                    {preview.columns.map((col) => (
                      <th key={col} className="px-2 py-1.5 text-left font-semibold text-text-secondary whitespace-nowrap border-b border-border-default">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-border-default last:border-b-0">
                      {preview.columns.map((col) => (
                        <td key={col} className="px-2 py-1 text-text-primary whitespace-nowrap max-w-[160px] truncate">
                          {row[col] == null ? <span className="text-text-muted italic">null</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1 bg-surface-secondary border-t border-border-default">
              <p className="text-[11px] text-text-muted text-center">
                {preview.rows.length} row{preview.rows.length !== 1 ? 's' : ''} (limited to 50)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onApprove(sql)}
          className="text-[15px] font-medium rounded-lg transition-colors"
          style={{ padding: '10px 24px', backgroundColor: '#3b82f6', color: '#fff' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2563eb' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#3b82f6' }}
        >
          Use this data
        </button>
        <button
          onClick={onSkip}
          className="text-[15px] font-medium text-text-secondary hover:text-text-primary rounded-lg border border-border-default hover:border-border-hover transition-colors"
          style={{ padding: '10px 24px' }}
        >
          Use all data
        </button>
      </div>
    </div>
  )
}
