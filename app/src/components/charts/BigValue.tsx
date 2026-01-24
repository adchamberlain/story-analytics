/**
 * BigValue (KPI) component.
 * Displays a large metric value with optional comparison, trend, and sparkline.
 */

import type { ChartConfig } from '../../types/chart'
import { formatCurrency, formatPercent, autoFormat } from '../../utils/formatters'
import { DeltaValue, calculatePercentChange } from './DeltaValue'
import { Sparkline, extractSparklineData } from './Sparkline'

interface BigValueProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function BigValue({ data, config }: BigValueProps) {
  const valueColumn = config.value || config.y
  const title = config.title
  const valueFormat = config.valueFormat
  const comparisonColumn = config.comparisonValue
  const comparisonLabel = config.comparisonLabel || 'vs previous'
  const positiveIsGood = config.positiveIsGood ?? true
  const showTrend = config.showTrend ?? !!comparisonColumn
  const sparklineX = config.sparklineX
  const sparklineY = config.sparklineY
  const sparklineType = config.sparklineType || 'line'

  if (!valueColumn || data.length === 0) {
    return <div className="error-message">No value to display</div>
  }

  // Get the first row's value
  const firstColumn = typeof valueColumn === 'string' ? valueColumn : valueColumn[0]
  const rawValue = data[0][firstColumn]
  const currentValue = typeof rawValue === 'number' ? rawValue : null

  // Get comparison value if specified
  const comparisonValue = comparisonColumn
    ? (data[0][comparisonColumn] as number | null)
    : null

  // Calculate percent change for trend
  const percentChange = calculatePercentChange(currentValue, comparisonValue)

  // Format the main value
  let displayValue: string
  if (currentValue === null) {
    displayValue = '—'
  } else if (valueFormat === 'currency') {
    displayValue = formatCurrency(currentValue, { compact: true })
  } else if (valueFormat === 'percent') {
    displayValue = formatPercent(currentValue, { fromDecimal: true })
  } else {
    displayValue = autoFormat(currentValue)
  }

  // Extract sparkline data if configured
  let sparklineData: number[] | null = null
  let sparklineXData: (string | number)[] | undefined
  if (sparklineY && data.length > 1) {
    const extracted = extractSparklineData(data, sparklineY, sparklineX)
    sparklineData = extracted.data
    sparklineXData = extracted.xData
  }

  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        minHeight: '150px',
        textAlign: 'center',
        gap: 'var(--space-2)',
      }}
    >
      {/* Title */}
      {title && (
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-medium)' as unknown as number,
            color: 'var(--color-gray-500)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </div>
      )}

      {/* Main value */}
      <div
        style={{
          fontSize: 'var(--text-4xl)',
          fontWeight: 'var(--font-bold)' as unknown as number,
          color: 'var(--color-gray-900)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {displayValue}
      </div>

      {/* Trend/Comparison row */}
      {showTrend && percentChange !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-1)',
          }}
        >
          <DeltaValue
            value={percentChange}
            mode="percent"
            positiveIsGood={positiveIsGood}
            size="md"
            showArrow={true}
          />
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-400)',
            }}
          >
            {comparisonLabel}
          </span>
        </div>
      )}

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 1 && (
        <div
          style={{
            marginTop: 'var(--space-2)',
          }}
        >
          <Sparkline
            data={sparklineData}
            xData={sparklineXData}
            type={sparklineType}
            width={120}
            height={36}
            fill={sparklineType === 'line'}
          />
        </div>
      )}
    </div>
  )
}
