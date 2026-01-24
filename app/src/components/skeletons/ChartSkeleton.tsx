/**
 * ChartSkeleton component.
 * Chart-shaped skeleton placeholder for loading states.
 */

import { SkeletonBase } from './SkeletonBase'

interface ChartSkeletonProps {
  /** Type of chart skeleton to show */
  type?: 'line' | 'bar' | 'bigvalue' | 'table'
  /** Height of the chart area */
  height?: number
  /** Show title skeleton */
  showTitle?: boolean
  /** Custom className */
  className?: string
}

export function ChartSkeleton({
  type = 'line',
  height = 300,
  showTitle = true,
  className = '',
}: ChartSkeletonProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
      }}
    >
      {/* Title skeleton */}
      {showTitle && (
        <SkeletonBase width="40%" height={20} />
      )}

      {/* Chart area */}
      {type === 'bigvalue' ? (
        <BigValueSkeleton />
      ) : type === 'table' ? (
        <TableSkeleton />
      ) : type === 'bar' ? (
        <BarChartSkeleton height={height} />
      ) : (
        <LineChartSkeleton height={height} />
      )}
    </div>
  )
}

/**
 * Line chart skeleton with axis placeholders.
 */
function LineChartSkeleton({ height }: { height: number }) {
  return (
    <div
      style={{
        position: 'relative',
        height,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-2)',
        paddingLeft: 'var(--space-8)',
        paddingBottom: 'var(--space-6)',
      }}
    >
      {/* Y-axis ticks */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 'var(--space-8)',
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBase key={i} width={24} height={12} />
        ))}
      </div>

      {/* Chart area with wave pattern */}
      <div
        style={{
          flex: 1,
          height: '100%',
          position: 'relative',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 400 200"
          preserveAspectRatio="none"
          style={{ opacity: 0.3 }}
        >
          <defs>
            <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-gray-200)" />
              <stop offset="50%" stopColor="var(--color-gray-100)" />
              <stop offset="100%" stopColor="var(--color-gray-200)" />
              <animate
                attributeName="x1"
                values="-100%;100%"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values="0%;200%"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>
          <path
            d="M0,150 Q50,100 100,120 T200,80 T300,100 T400,60"
            fill="none"
            stroke="url(#shimmer)"
            strokeWidth="3"
          />
        </svg>
      </div>

      {/* X-axis ticks */}
      <div
        style={{
          position: 'absolute',
          left: 'var(--space-8)',
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBase key={i} width={40} height={12} />
        ))}
      </div>
    </div>
  )
}

/**
 * Bar chart skeleton.
 */
function BarChartSkeleton({ height }: { height: number }) {
  const barCount = 6
  const bars = Array.from({ length: barCount }, () => ({
    height: Math.random() * 0.6 + 0.3, // 30-90% height
  }))

  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-2)',
        paddingLeft: 'var(--space-8)',
        paddingBottom: 'var(--space-6)',
      }}
    >
      {/* Y-axis ticks */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 'var(--space-8)',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBase key={i} width={24} height={12} />
        ))}
      </div>

      {/* Bars */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          gap: 'var(--space-2)',
        }}
      >
        {bars.map((bar, i) => (
          <SkeletonBase
            key={i}
            width="12%"
            height={`${bar.height * 100}%`}
            borderRadius="var(--radius-sm) var(--radius-sm) 0 0"
          />
        ))}
      </div>
    </div>
  )
}

/**
 * BigValue/KPI skeleton.
 */
function BigValueSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        gap: 'var(--space-3)',
        minHeight: 150,
      }}
    >
      {/* Label */}
      <SkeletonBase width={80} height={14} />
      {/* Value */}
      <SkeletonBase width={120} height={48} borderRadius="var(--radius-md)" />
      {/* Trend */}
      <SkeletonBase width={100} height={16} />
    </div>
  )
}

/**
 * Table skeleton.
 */
function TableSkeleton() {
  const rows = 5
  const cols = 4

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          paddingBottom: 'var(--space-2)',
          borderBottom: '1px solid var(--color-gray-200)',
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBase
            key={i}
            width={`${100 / cols}%`}
            height={16}
          />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            padding: 'var(--space-2) 0',
          }}
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <SkeletonBase
              key={colIdx}
              width={`${100 / cols}%`}
              height={14}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
