/**
 * ChartCard component.
 * Wraps a chart with title, options menu, and styling.
 */

import type { ChartRenderData } from '../../types/chart'
import { ChartFactory } from '../charts/ChartFactory'

interface ChartCardProps {
  chart: ChartRenderData
  showTitle?: boolean
}

export function ChartCard({ chart, showTitle = true }: ChartCardProps) {
  const title = chart.spec.config?.title

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {showTitle && title && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-gray-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--color-gray-900)',
              margin: 0,
            }}
          >
            {title}
          </h3>
          {/* Options menu placeholder */}
          <button
            style={{
              padding: '0.25rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-gray-400)',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Options"
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
        </div>
      )}

      <div style={{ padding: '1rem' }}>
        <ChartFactory
          spec={chart.spec}
          data={chart.data}
          columns={chart.columns}
        />
      </div>
    </div>
  )
}
