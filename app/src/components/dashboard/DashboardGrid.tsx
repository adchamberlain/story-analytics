import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  GridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
} from 'react-grid-layout'
import { ChartWrapper } from '../charts/ChartWrapper'
import { ChartErrorBoundary } from '../charts/ChartErrorBoundary'
import { ObservableChartFactory } from '../charts/ObservableChartFactory'
import { buildChartConfig } from '../../utils/buildChartConfig'
import type { ChartType } from '../../types/chart'
import type { GridLayout as GridLayoutPos } from '../../stores/dashboardBuilderStore'
import type { EmbedFlags } from '../../utils/embedFlags'

// ── Types ───────────────────────────────────────────────────────────────────

interface ChartWithData {
  chart_id: string
  width: string
  chart_type: string
  title: string | null
  subtitle: string | null
  source: string | null
  x: string | null
  y: string | string[] | null
  series: string | null
  horizontal: boolean
  sort: boolean
  config: Record<string, unknown> | null
  data: Record<string, unknown>[]
  columns: string[]
  error: string | null
  data_ingested_at?: string | null
  freshness?: string | null
  error_type?: string | null
  error_suggestion?: string | null
  health_status?: string
  health_issues?: string[]
  layout?: GridLayoutPos | null
}

interface DashboardGridProps {
  charts: ChartWithData[]
  dashboardId?: string
  editable?: boolean
  onLayoutChange?: (items: LayoutItem[]) => void
  /** Embed render flags passed from embed page (controls plain/logo/search) */
  embedFlags?: EmbedFlags
}

// ── Strict 2-Column Layout Generator ────────────────────────────────────────

/**
 * Generates a 2-column grid layout. Each item is either:
 * - w=1 (half-width, one column)
 * - w=2 (full-width, spans both columns)
 * Items are placed left-to-right, top-to-bottom.
 */
function generateLayout(charts: ChartWithData[]): Layout {
  const items: LayoutItem[] = []
  let x = 0
  let y = 0

  for (const chart of charts) {
    // If the chart has a persisted layout, use it (but clamp w to 1 or 2)
    if (chart.layout) {
      const w = chart.layout.w >= 2 ? 2 : 1
      const itemBottom = chart.layout.y + chart.layout.h
      items.push({
        i: chart.chart_id,
        x: chart.layout.x >= 1 && w === 1 ? 1 : 0,
        y: chart.layout.y,
        w,
        h: chart.layout.h,
        minW: 1,
        maxW: 2,
        minH: 3,
      })
      // Advance cursor past persisted items so auto-placed items don't overlap
      if (itemBottom > y) {
        y = itemBottom
        x = 0
      }
      continue
    }

    // Auto-generate: full → w=2, half → w=1
    const w = chart.width === 'full' ? 2 : 1
    // Give charts enough vertical space for legends, axis labels, and map features
    const isBigValue = chart.chart_type === 'BigValue'
    const isTable = chart.chart_type === 'DataTable'
    const isMap = ['ChoroplethMap', 'SymbolMap', 'LocatorMap', 'SpikeMap'].includes(chart.chart_type)
    const h = isBigValue ? 7 : isTable ? 8 : isMap ? 9 : 7

    // If this item won't fit on the current row, wrap
    if (x + w > 2) {
      x = 0
      y += h
    }

    items.push({ i: chart.chart_id, x, y, w, h, minW: 1, maxW: 2, minH: 3 })
    x += w
    if (x >= 2) {
      x = 0
      y += h
    }
  }

  return items
}

/**
 * Strict 2-column dashboard grid.
 * Items are either 1-column or 2-column wide. No intermediate positions.
 * Supports drag-to-reorder and resize (height only in view, width snaps to 1 or 2 cols).
 */
export function DashboardGrid({ charts, dashboardId, editable = false, onLayoutChange, embedFlags }: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth()
  const layout = useMemo(() => generateLayout(charts), [charts])

  if (charts.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-text-muted">No charts in this dashboard yet.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      {mounted && (
        <GridLayout
          className="dashboard-grid"
          width={width}
          gridConfig={{
            cols: 2,
            rowHeight: 60,
            margin: [24, 24] as [number, number],
            containerPadding: [0, 0] as [number, number],
          }}
          layout={layout}
          dragConfig={{ enabled: editable, handle: '.drag-handle' }}
          resizeConfig={{ enabled: editable, handles: editable ? ['se'] : [] }}
          onLayoutChange={(currentLayout: Layout) => {
            if (editable && onLayoutChange) {
              // Clamp all items to strict 2-col: w must be 1 or 2, x must be 0 or 1
              const clamped = [...currentLayout].map(item => {
                const w = item.w >= 2 ? 2 : 1
                return {
                  ...item,
                  w,
                  x: w >= 2 ? 0 : (item.x >= 1 ? 1 : 0),
                }
              })
              onLayoutChange(clamped)
            }
          }}
        >
          {charts.map((chart) => (
            <div key={chart.chart_id} className="overflow-hidden">
              <ChartErrorBoundary chartTitle={chart.title ?? undefined}>
                <DashboardChartCell chart={chart} dashboardId={dashboardId} editable={editable} embedFlags={embedFlags} />
              </ChartErrorBoundary>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

// ── Status Dot ──────────────────────────────────────────────────────────────

function StatusDot({ status, issues }: { status?: string; issues?: string[] }) {
  if (!status || status === 'healthy') return null

  const color = status === 'error' ? 'bg-red-500' : 'bg-amber-500'
  const tooltip = issues?.length ? issues.join('\n') : status

  return (
    <span
      className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${color}`}
      title={tooltip}
    />
  )
}

// ── Individual Chart Cell ───────────────────────────────────────────────────

function DashboardChartCell({
  chart,
  dashboardId,
  editable,
  embedFlags,
}: {
  chart: ChartWithData
  dashboardId?: string
  editable: boolean
  embedFlags?: EmbedFlags
}) {
  if (chart.error) {
    if (chart.error_type === 'schema_change') {
      return (
        <div className="relative h-full bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="text-sm text-amber-800 font-medium">Schema changed</p>
          {chart.error_suggestion && (
            <p className="text-xs text-amber-700 mt-1">{chart.error_suggestion}</p>
          )}
          {dashboardId && (
            <Link
              to={`/dashboard/${dashboardId}/edit`}
              className="text-xs text-amber-700 underline mt-2 inline-block hover:text-amber-900"
            >
              Edit chart
            </Link>
          )}
        </div>
      )
    }

    return (
      <div className="relative h-full bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
        <p className="text-sm text-red-700 font-medium">
          {chart.error_type === 'source_missing' ? 'Data source missing' : 'Chart unavailable'}
        </p>
        <p className="text-xs text-red-600 mt-1">{chart.error}</p>
        {chart.error_suggestion && (
          <p className="text-xs text-red-500 mt-1">{chart.error_suggestion}</p>
        )}
      </div>
    )
  }

  const chartType = (chart.chart_type ?? 'BarChart') as ChartType

  const chartConfig = buildChartConfig(chart)

  // Apply embed search flag via extraProps for DataTable initialSearch
  if (embedFlags?.search) {
    chartConfig.extraProps = { ...chartConfig.extraProps, initialSearch: embedFlags.search }
  }

  // Apply embed logo flag to ChartWrapper
  const showLogo = embedFlags?.logo !== null ? embedFlags?.logo : undefined

  return (
    <div className="group relative h-full">
      {editable && (
        <div className="drag-handle absolute top-0 left-0 right-0 h-8 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center">
          <svg className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" />
          </svg>
        </div>
      )}
      <StatusDot status={chart.health_status} issues={chart.health_issues} />
      <ChartWrapper
        title={embedFlags?.plain ? undefined : (chart.title ?? undefined)}
        subtitle={embedFlags?.plain ? undefined : (chart.subtitle ?? undefined)}
        source={embedFlags?.plain ? undefined : (chart.source ?? undefined)}
        sourceUrl={embedFlags?.plain ? undefined : ((chart.config?.sourceUrl as string) ?? undefined)}
        chartUrl={`/chart/${chart.chart_id}`}
        chartId={chart.chart_id}
        allowDataDownload={(chart.config?.allowDataDownload as boolean) !== false}
        className="h-full"
        compact
        hideLogo={showLogo === false}
      >
        <ObservableChartFactory
          data={chart.data}
          config={chartConfig}
          chartType={chartType}
          autoHeight
        />
      </ChartWrapper>
    </div>
  )
}
