/**
 * DeltaValue component.
 * Displays a formatted change value with sign, color, and optional trend indicator.
 */

import { formatCompact, formatPercent, formatCurrency } from '../../utils/formatters'
import { TrendIndicator, getTrendDirection, type TrendDirection } from './TrendIndicator'

export type DeltaMode = 'absolute' | 'percent'
export type DeltaSize = 'sm' | 'md' | 'lg'

interface DeltaValueProps {
  /** The change value (difference or percentage change) */
  value: number | null | undefined
  /** Display mode: 'absolute' shows the raw value, 'percent' treats value as decimal */
  mode?: DeltaMode
  /** Whether positive change is good (green) or bad (red) */
  positiveIsGood?: boolean
  /** Size of the component */
  size?: DeltaSize
  /** Optional label to display after the value */
  label?: string
  /** Show the trend arrow */
  showArrow?: boolean
  /** Format hint for absolute mode */
  format?: 'currency' | 'number'
  /** Custom className */
  className?: string
}

const sizeStyles: Record<DeltaSize, React.CSSProperties> = {
  sm: {
    fontSize: 'var(--text-sm)',
    gap: 'var(--space-1)',
  },
  md: {
    fontSize: 'var(--text-base)',
    gap: 'var(--space-1)',
  },
  lg: {
    fontSize: 'var(--text-lg)',
    gap: 'var(--space-2)',
  },
}

export function DeltaValue({
  value,
  mode = 'absolute',
  positiveIsGood = true,
  size = 'md',
  label,
  showArrow = true,
  format = 'number',
  className = '',
}: DeltaValueProps) {
  // Handle null/undefined
  if (value === null || value === undefined || isNaN(value)) {
    return (
      <span
        className={`trend-neutral ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontWeight: 'var(--font-medium)' as unknown as number,
          ...sizeStyles[size],
        }}
      >
        —
      </span>
    )
  }

  const direction: TrendDirection = getTrendDirection(value)

  // Determine color class
  let colorClass: string
  if (direction === 'neutral') {
    colorClass = 'trend-neutral'
  } else {
    const isGood =
      (direction === 'up' && positiveIsGood) ||
      (direction === 'down' && !positiveIsGood)
    colorClass = isGood ? 'trend-up' : 'trend-down'
  }

  // Format the value
  let formattedValue: string
  if (mode === 'percent') {
    formattedValue = formatPercent(value, { showPositiveSign: true })
  } else if (format === 'currency') {
    formattedValue = formatCurrency(value, { compact: true, showPositiveSign: true })
  } else {
    formattedValue = formatCompact(value, { showPositiveSign: true })
  }

  return (
    <span
      className={`${colorClass} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 'var(--font-medium)' as unknown as number,
        ...sizeStyles[size],
      }}
    >
      {showArrow && (
        <TrendIndicator
          direction={direction}
          positiveIsGood={positiveIsGood}
          size={size}
        />
      )}
      <span>{formattedValue}</span>
      {label && (
        <span
          style={{
            color: 'var(--color-gray-500)',
            fontWeight: 'var(--font-normal)' as unknown as number,
            marginLeft: 'var(--space-1)',
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}

/**
 * Calculate percentage change between two values.
 */
export function calculatePercentChange(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0
  ) {
    return null
  }

  return (current - previous) / previous
}

/**
 * Calculate absolute change between two values.
 */
export function calculateAbsoluteChange(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  ) {
    return null
  }

  return current - previous
}
