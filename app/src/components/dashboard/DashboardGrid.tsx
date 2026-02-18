import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  GridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
} from 'react-grid-layout'
import { ChartWrapper } from '../charts/ChartWrapper'
import { ObservableChartFactory } from '../charts/ObservableChartFactory'
import { PALETTES } from '../../themes/datawrapper'
import type { ChartConfig, ChartType } from '../../types/chart'
import type { PaletteKey } from '../../themes/datawrapper'
import type { GridLayout as GridLayoutPos } from '../../stores/dashboardBuilderStore'

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
      continue
    }

    // Auto-generate: full → w=2, half → w=1
    const w = chart.width === 'full' ? 2 : 1
    const h = 5

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
export function DashboardGrid({ charts, dashboardId, editable = false, onLayoutChange }: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth()
  const layout = useMemo(() => generateLayout(charts), [charts])

  if (charts.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-text-muted">No charts in this dashboard yet.</p>
      </div>
    )
  }

  // Build a height map from the computed layout so each cell knows its grid height
  const heightMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of layout) {
      map[item.i] = item.h
    }
    return map
  }, [layout])

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
              const clamped = [...currentLayout].map(item => ({
                ...item,
                w: item.w >= 2 ? 2 : 1,
                x: item.w >= 2 ? 0 : (item.x >= 1 ? 1 : 0),
              }))
              onLayoutChange(clamped)
            }
          }}
        >
          {charts.map((chart) => (
            <div key={chart.chart_id} className="overflow-hidden">
              <DashboardChartCell chart={chart} dashboardId={dashboardId} editable={editable} gridH={heightMap[chart.chart_id] ?? 5} />
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
  gridH,
}: {
  chart: ChartWithData
  dashboardId?: string
  editable: boolean
  gridH: number
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

  // Multi-Y: backend UNPIVOT produces metric_name/metric_value columns
  const isMultiY = Array.isArray(chart.y) && chart.y.length > 1
  const chartConfig: ChartConfig = {
    x: chart.x ?? undefined,
    y: isMultiY ? 'metric_value' : (Array.isArray(chart.y) ? chart.y[0] : chart.y) ?? undefined,
    series: isMultiY ? 'metric_name' : chart.series ?? undefined,
    horizontal: chart.horizontal,
    sort: chart.sort,
    stacked: (chart.config?.stacked as boolean) ?? false,
    showGrid: (chart.config?.showGrid as boolean) ?? true,
    showLegend: (chart.config?.showLegend as boolean) ?? true,
    showValues: (chart.config?.showValues as boolean) ?? false,
    xAxisTitle: (chart.config?.xAxisTitle as string) || undefined,
    yAxisTitle: (chart.config?.yAxisTitle as string) || undefined,
    annotations: chart.config?.annotations as ChartConfig['annotations'],
    value: (chart.config?.value as string) ?? undefined,
    comparisonValue: (chart.config?.comparisonValue as string) ?? undefined,
    comparisonLabel: (chart.config?.comparisonLabel as string) || undefined,
    valueFormat: (chart.config?.valueFormat as ChartConfig['valueFormat']) || undefined,
    positiveIsGood: (chart.config?.positiveIsGood as boolean) ?? true,
  }

  const palette = (chart.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  // Compute available chart height from grid row height (60px) and gap (24px)
  // Overhead: p-5 padding (40px), header (~35px), chart gap (8px), footer gap + source (~24px), potential legend (~15px)
  const cellHeight = gridH * 60 + (gridH - 1) * 24
  const chartHeight = Math.max(cellHeight - 122, 120)

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
        title={chart.title ?? undefined}
        subtitle={chart.subtitle ?? undefined}
        source={chart.source ?? undefined}
        sourceUrl={(chart.config?.sourceUrl as string) ?? undefined}
        chartUrl={`/chart/${chart.chart_id}`}
        className="h-full"
        compact
      >
        <ObservableChartFactory
          data={chart.data}
          config={chartConfig}
          chartType={chartType}
          height={chartHeight}
        />
      </ChartWrapper>
    </div>
  )
}
