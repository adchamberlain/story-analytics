/**
 * ChartCard component.
 * Wraps a chart with title, options menu, loading states, and styling.
 */

import type { ChartRenderData, ChartType } from '../../types/chart'
import { ChartFactory } from '../charts/ChartFactory'
import { ChartSkeleton } from '../skeletons'

interface ChartCardProps {
  chart?: ChartRenderData
  showTitle?: boolean
  /** Show loading skeleton */
  loading?: boolean
  /** Error message to display */
  error?: string
  /** Skeleton type hint for loading state */
  skeletonType?: 'line' | 'bar' | 'bigvalue' | 'table'
}

/**
 * Map chart types to skeleton types.
 */
function getSkeletonType(chartType?: ChartType): 'line' | 'bar' | 'bigvalue' | 'table' {
  if (!chartType) return 'line'

  switch (chartType) {
    case 'BarChart':
    case 'Histogram':
      return 'bar'
    case 'BigValue':
      return 'bigvalue'
    case 'DataTable':
      return 'table'
    default:
      return 'line'
  }
}

export function ChartCard({
  chart,
  showTitle = true,
  loading = false,
  error,
  skeletonType,
}: ChartCardProps) {
  const title = chart?.spec.config?.title
  const actualSkeletonType = skeletonType || getSkeletonType(chart?.spec.chartType)

  return (
    <div
      className="fade-in"
      style={{
        backgroundColor: 'white',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        transition: 'box-shadow var(--transition-base)',
      }}
    >
      {/* Header */}
      {showTitle && (title || loading) && (
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-gray-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {loading ? (
            <div
              className="skeleton"
              style={{
                width: '40%',
                height: '1.25rem',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          ) : (
            <h3
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--font-semibold)' as unknown as number,
                color: 'var(--color-gray-900)',
                margin: 0,
              }}
            >
              {title}
            </h3>
          )}

          {/* Options menu */}
          {!loading && (
            <button
              style={{
                padding: 'var(--space-1)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-gray-400)',
                borderRadius: 'var(--radius-sm)',
                transition: 'color var(--transition-fast)',
              }}
              title="Options"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-gray-600)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-gray-400)'
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content area */}
      <div
        style={{
          padding: 'var(--space-4)',
          minHeight: 200,
        }}
      >
        {/* Loading state */}
        {loading && (
          <ChartSkeleton type={actualSkeletonType} showTitle={false} />
        )}

        {/* Error state */}
        {!loading && error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-error)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 'var(--space-4)', opacity: 0.6 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p
              style={{
                color: 'var(--color-error)',
                fontSize: 'var(--text-sm)',
                margin: 0,
                maxWidth: 300,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Chart content */}
        {!loading && !error && chart && (
          <ChartFactory
            spec={chart.spec}
            data={chart.data}
            columns={chart.columns}
          />
        )}

        {/* Empty state (no data) */}
        {!loading && !error && !chart && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-gray-300)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 'var(--space-4)' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <p
              style={{
                color: 'var(--color-gray-400)',
                fontSize: 'var(--text-sm)',
                margin: 0,
              }}
            >
              No data available
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
