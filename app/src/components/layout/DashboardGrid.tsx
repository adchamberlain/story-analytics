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
}

export function DashboardGrid({ charts, layout }: DashboardGridProps) {
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
                {sectionCharts.map((chart, index) => (
                  <ChartCard key={index} chart={chart} />
                ))}
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
      {charts.map((chart, index) => (
        <ChartCard key={index} chart={chart} />
      ))}
    </div>
  )
}
