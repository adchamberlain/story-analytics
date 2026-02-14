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
}

interface DashboardGridProps {
  charts: ChartWithData[]
}

/**
 * Responsive dashboard grid. Renders charts at full or half width.
 * Read-only — used in both public view and builder preview.
 */
export function DashboardGrid({ charts }: DashboardGridProps) {
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
          className={chart.width === 'full' ? 'col-span-full' : undefined}
        >
          <DashboardChartCell chart={chart} />
        </div>
      ))}
    </div>
  )
}

// ── Individual Chart Cell ───────────────────────────────────────────────────

function DashboardChartCell({ chart }: { chart: ChartWithData }) {
  if (chart.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4">
        <p className="text-sm text-red-700 font-medium">Chart unavailable</p>
        <p className="text-xs text-red-600 mt-1">{chart.error}</p>
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
  }

  const palette = (chart.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.color = paletteColors[paletteColors.length - 1] as string
  }

  return (
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
  )
}
