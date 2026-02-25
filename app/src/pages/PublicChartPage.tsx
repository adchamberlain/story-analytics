import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig, ChartType } from '../types/chart'
import type { PaletteKey } from '../themes/plotTheme'

interface PublicChartData {
  id: string
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
  status: string
}

/**
 * Read-only public chart view. No editor chrome, no auth required.
 * Fetches from /api/v2/charts/{id}/public — only works for published charts.
 */
export function PublicChartPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [chart, setChart] = useState<PublicChartData | null>(null)
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chartId) return
    setLoading(true)
    setError(null)

    // Fetch chart metadata from public endpoint
    fetch(`/api/v2/charts/${chartId}/public`)
      .then(async (res) => {
        if (res.status === 403) throw new Error('This chart is not published.')
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(body.detail ?? `Failed to load chart`)
        }
        return res.json()
      })
      .then((chartData: PublicChartData) => {
        setChart(chartData)
        // Now fetch the actual data (re-execute SQL)
        return fetch(`/api/v2/charts/${chartId}`)
      })
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json()
          setData(result.data ?? [])
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [chartId])

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-sm text-gray-400">Loading chart...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!chart) return null

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
    annotations: (chart.config?.annotations as ChartConfig['annotations']) ?? undefined,
    value: (chart.config?.value as string) ?? undefined,
    comparisonValue: (chart.config?.comparisonValue as string) ?? undefined,
    comparisonLabel: (chart.config?.comparisonLabel as string) || undefined,
    valueFormat: (chart.config?.valueFormat as ChartConfig['valueFormat']) || undefined,
    positiveIsGood: (chart.config?.positiveIsGood as boolean) ?? true,
    metricLabel: (chart.config?.metricLabel as string) ?? undefined,
  }

  const paletteKey = (chart.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[paletteKey] ?? PALETTES.default
  if (paletteKey !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center p-8">
      <div className="w-full max-w-3xl">
        <ChartWrapper
          title={chart.title ?? undefined}
          subtitle={chart.subtitle ?? undefined}
          source={chart.source ?? undefined}
          chartId={chart.id}
          allowDataDownload={(chart.config?.allowDataDownload as boolean) !== false}
        >
          <ObservableChartFactory
            data={data}
            config={chartConfig}
            chartType={chart.chart_type as ChartType}
            height={480}
          />
        </ChartWrapper>
        <p className="text-center text-xs text-gray-400 mt-6">
          Created with Story Analytics
        </p>
      </div>
    </div>
  )
}
