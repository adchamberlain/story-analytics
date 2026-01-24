/**
 * BigValue (KPI) component.
 * Displays a large metric value with optional comparison.
 */

import type { ChartConfig } from '../../types/chart'

interface BigValueProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function BigValue({ data, config }: BigValueProps) {
  const valueColumn = config.value || config.y
  const title = config.title

  if (!valueColumn || data.length === 0) {
    return <div className="error-message">No value to display</div>
  }

  // Get the first row's value
  const firstColumn = typeof valueColumn === 'string' ? valueColumn : valueColumn[0]
  const rawValue = data[0][firstColumn]

  // Format the value
  let displayValue: string
  if (typeof rawValue === 'number') {
    // Format large numbers with K/M/B suffixes
    if (Math.abs(rawValue) >= 1_000_000_000) {
      displayValue = `${(rawValue / 1_000_000_000).toFixed(1)}B`
    } else if (Math.abs(rawValue) >= 1_000_000) {
      displayValue = `${(rawValue / 1_000_000).toFixed(1)}M`
    } else if (Math.abs(rawValue) >= 1_000) {
      displayValue = `${(rawValue / 1_000).toFixed(1)}K`
    } else if (Number.isInteger(rawValue)) {
      displayValue = rawValue.toLocaleString()
    } else {
      displayValue = rawValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  } else {
    displayValue = String(rawValue ?? '—')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        minHeight: '150px',
        textAlign: 'center',
      }}
    >
      {title && (
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-gray-500)',
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          fontSize: '3rem',
          fontWeight: 700,
          color: 'var(--color-gray-900)',
          lineHeight: 1.1,
        }}
      >
        {displayValue}
      </div>
    </div>
  )
}
