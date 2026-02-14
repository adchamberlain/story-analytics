import type { ColumnInfo, PreviewData } from '../../stores/dataStore'

interface DataPreviewProps {
  filename: string
  rowCount: number
  columns: ColumnInfo[]
  preview: PreviewData | null
  loadingPreview: boolean
}

export function DataPreview({ filename, rowCount, columns, preview, loadingPreview }: DataPreviewProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {filename}
            </h3>
            <p className="text-xs mt-0.5 text-text-muted">
              {rowCount.toLocaleString()} rows, {columns.length} columns
            </p>
          </div>
        </div>
      </div>

      {/* Column schema */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap gap-2">
          {columns.map((col) => (
            <div key={col.name} className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-text-primary">{col.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-mono text-[10px]">
                {formatType(col.type)}
              </span>
              {col.null_count > 0 && (
                <span className="text-amber-500" title={`${col.null_count} nulls`}>
                  ({col.null_count} null{col.null_count > 1 ? 's' : ''})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data preview table */}
      {loadingPreview ? (
        <div className="px-6 py-8 text-center text-sm text-gray-400">Loading preview...</div>
      ) : preview ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {preview.columns.map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-2 font-semibold whitespace-nowrap text-text-primary text-xs"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {preview.columns.map((col) => (
                    <td
                      key={col}
                      className="px-4 py-1.5 border-b border-gray-50 whitespace-nowrap text-xs text-gray-800"
                    >
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function formatType(t: string): string {
  const map: Record<string, string> = {
    'VARCHAR': 'text',
    'BIGINT': 'int',
    'INTEGER': 'int',
    'DOUBLE': 'float',
    'FLOAT': 'float',
    'BOOLEAN': 'bool',
    'DATE': 'date',
    'TIMESTAMP': 'datetime',
    'TIMESTAMP WITH TIME ZONE': 'datetime',
  }
  return map[t.toUpperCase()] ?? t.toLowerCase()
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}
