/**
 * DashboardGrid component.
 * CSS Grid-based layout for multiple charts.
 */

import type { ChartRenderData } from '../../types/chart'
import type { DashboardLayout } from '../../types/dashboard'
import { ChartCard } from './ChartCard'

interface DashboardGridProps {
  charts: ChartRenderData[]
  layout?: DashboardLayout
  /** Show "View Code" section below each chart */
  showCode?: boolean
  /** Chart IDs corresponding to each chart (required for SQL editing) */
  chartIds?: string[]
  /** Callback when SQL is updated (triggers chart refresh) */
  onSqlUpdate?: (chartId: string, newSql: string) => void
}

export function DashboardGrid({ charts, layout, showCode = false, chartIds, onSqlUpdate }: DashboardGridProps) {
  // If we have sections, render with section headers
  if (layout?.sections && layout.sections.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {layout.sections.map((section, sectionIndex) => {
          // Get charts for this section
          const sectionCharts = section.chartIds
            .map((_, chartIndex) => charts[sectionIndex * section.chartIds.length + chartIndex])
            .filter(Boolean)

          if (sectionCharts.length === 0) return null

          return (
            <div key={sectionIndex}>
              {section.title && (
                <h2
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: 'var(--color-gray-800)',
                    marginBottom: '1rem',
                  }}
                >
                  {section.title}
                </h2>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                {sectionCharts.map((chart, index) => {
                  // Calculate the actual chart index in the full charts array
                  const chartIndex = sectionIndex * section.chartIds.length + index
                  const chartId = chartIds?.[chartIndex]
                  return (
                    <ChartCard
                      key={chartId || index}
                      chart={chart}
                      chartId={chartId}
                      showCode={showCode}
                      onSqlUpdate={onSqlUpdate}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Simple grid layout without sections
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {charts.map((chart, index) => {
        const chartId = chartIds?.[index]
        return (
          <ChartCard
            key={chartId || index}
            chart={chart}
            chartId={chartId}
            showCode={showCode}
            onSqlUpdate={onSqlUpdate}
          />
        )
      })}
    </div>
  )
}
