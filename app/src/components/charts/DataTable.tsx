/**
 * Data table component.
 * Displays query results in a tabular format.
 */

import type { ChartConfig } from '../../types/chart'

interface DataTableProps {
  data: Record<string, unknown>[]
  config: ChartConfig
  columns?: string[]
}

export function DataTable({ data, config, columns }: DataTableProps) {
  if (data.length === 0) {
    return <div className="error-message">No data to display</div>
  }

  // Get column headers - use provided columns or infer from data
  const headers = columns || Object.keys(data[0])

  // Format cell values
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '—'
    }
    if (typeof value === 'number') {
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
    if (value instanceof Date) {
      return value.toLocaleDateString()
    }
    return String(value)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {config.title && (
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-gray-900)',
            marginBottom: '0.75rem',
          }}
        >
          {config.title}
        </div>
      )}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
        }}
      >
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  textAlign: 'left',
                  padding: '0.75rem',
                  borderBottom: '2px solid var(--color-gray-200)',
                  color: 'var(--color-gray-600)',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  whiteSpace: 'nowrap',
                }}
              >
                {header.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor: rowIndex % 2 === 0 ? 'transparent' : 'var(--color-gray-50)',
              }}
            >
              {headers.map((header) => (
                <td
                  key={header}
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--color-gray-100)',
                    color: 'var(--color-gray-800)',
                  }}
                >
                  {formatValue(row[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
