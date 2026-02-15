import { Link } from 'react-router-dom'
import { ChartWrapper } from '../charts/ChartWrapper'
import { ObservableChartFactory } from '../charts/ObservableChartFactory'
import { PALETTES } from '../../themes/datawrapper'
import type { ChartConfig, ChartType } from '../../types/chart'
import type { PaletteKey } from '../../themes/datawrapper'

// ── Types ───────────────────────────────────────────────────────────────────

interface ChartWithData {
  chart_id: string
  width: string
  chart_type: string
  title: string | null
  subtitle: string | null
  source: string | null
  x: string | null
  y: string | null
  series: string | null
  horizontal: boolean
  sort: boolean
  config: Record<string, unknown> | null
  data: Record<string, unknown>[]
  columns: string[]
  error: string | null
  // 11.2: Data freshness
  data_ingested_at?: string | null
  freshness?: string | null
  // 11.3: Schema change detection
  error_type?: string | null
  error_suggestion?: string | null
  // 11.4: Health status
  health_status?: string
  health_issues?: string[]
}

interface DashboardGridProps {
  charts: ChartWithData[]
  dashboardId?: string
}

/**
 * Responsive dashboard grid. Renders charts at full or half width.
 * Read-only — used in both public view and builder preview.
 */
export function DashboardGrid({ charts, dashboardId }: DashboardGridProps) {
  if (charts.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-text-muted">No charts in this dashboard yet.</p>
      </div>
    )
  }

  return (
    <div
      className="grid gap-6 grid-cols-2"
    >
      {charts.map((chart) => (
        <div
          key={chart.chart_id}
          className={`rounded-xl shadow-card ${chart.width === 'full' ? 'col-span-full' : ''}`}
        >
          <DashboardChartCell chart={chart} dashboardId={dashboardId} />
        </div>
      ))}
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
}: {
  chart: ChartWithData
  dashboardId?: string
}) {
  if (chart.error) {
    // Schema change: amber card with suggestion
    if (chart.error_type === 'schema_change') {
      return (
        <div className="relative bg-amber-50 border border-amber-200 rounded-lg px-5 py-4">
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

    // Source missing / generic SQL error: red card
    return (
      <div className="relative bg-red-50 border border-red-200 rounded-lg px-5 py-4">
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

  const chartConfig: ChartConfig = {
    x: chart.x ?? undefined,
    y: chart.y ?? undefined,
    series: chart.series ?? undefined,
    horizontal: chart.horizontal,
    sort: chart.sort,
    stacked: (chart.config?.stacked as boolean) ?? false,
    showGrid: (chart.config?.showGrid as boolean) ?? true,
    showLegend: (chart.config?.showLegend as boolean) ?? true,
    showValues: (chart.config?.showValues as boolean) ?? false,
    xAxisTitle: (chart.config?.xAxisTitle as string) || undefined,
    yAxisTitle: (chart.config?.yAxisTitle as string) || undefined,
    annotations: chart.config?.annotations as ChartConfig['annotations'],
  }

  const palette = (chart.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.color = paletteColors[paletteColors.length - 1] as string
  }

  return (
    <div className="relative">
      <StatusDot status={chart.health_status} issues={chart.health_issues} />
      <ChartWrapper
        title={chart.title ?? undefined}
        subtitle={chart.subtitle ?? undefined}
        source={chart.source ?? undefined}
      >
        <ObservableChartFactory
          data={chart.data}
          config={chartConfig}
          chartType={chartType}
          height={chart.width === 'full' ? 400 : 320}
        />
      </ChartWrapper>
    </div>
  )
}
