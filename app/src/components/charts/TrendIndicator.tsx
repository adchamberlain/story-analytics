/**
 * TrendIndicator component.
 * Displays an SVG arrow indicating trend direction with semantic coloring.
 */

export type TrendDirection = 'up' | 'down' | 'neutral'
export type TrendSize = 'sm' | 'md' | 'lg'

interface TrendIndicatorProps {
  /** Direction of the trend */
  direction: TrendDirection
  /** Whether positive/up trend is good (default: true) */
  positiveIsGood?: boolean
  /** Size of the indicator */
  size?: TrendSize
  /** Custom className */
  className?: string
}

const sizeMap: Record<TrendSize, number> = {
  sm: 12,
  md: 16,
  lg: 20,
}

/**
 * Get the appropriate color class based on direction and whether up is good.
 */
function getTrendColorClass(
  direction: TrendDirection,
  positiveIsGood: boolean
): string {
  if (direction === 'neutral') {
    return 'trend-neutral'
  }

  // Determine if the trend is "good" based on direction and context
  const isGoodTrend =
    (direction === 'up' && positiveIsGood) ||
    (direction === 'down' && !positiveIsGood)

  return isGoodTrend ? 'trend-up' : 'trend-down'
}

export function TrendIndicator({
  direction,
  positiveIsGood = true,
  size = 'md',
  className = '',
}: TrendIndicatorProps) {
  const pixelSize = sizeMap[size]
  const colorClass = getTrendColorClass(direction, positiveIsGood)

  return (
    <span
      className={`${colorClass} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transition: 'transform var(--transition-fast)',
        }}
      >
        {direction === 'up' && (
          <>
            <polyline points="18 15 12 9 6 15" />
          </>
        )}
        {direction === 'down' && (
          <>
            <polyline points="6 9 12 15 18 9" />
          </>
        )}
        {direction === 'neutral' && (
          <>
            <line x1="5" y1="12" x2="19" y2="12" />
          </>
        )}
      </svg>
    </span>
  )
}

/**
 * Utility to determine trend direction from a numeric change.
 */
export function getTrendDirection(
  change: number | null | undefined,
  threshold = 0.001
): TrendDirection {
  if (change === null || change === undefined || isNaN(change)) {
    return 'neutral'
  }

  if (change > threshold) {
    return 'up'
  }

  if (change < -threshold) {
    return 'down'
  }

  return 'neutral'
}
