import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { SharePanel } from '../components/sharing/SharePanel'
import { ThemeToggle } from '../components/layout/ThemeToggle'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig, ChartType } from '../types/chart'
import type { PaletteKey } from '../themes/plotTheme'

interface ChartData {
  chart: {
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
  }
  data: Record<string, unknown>[]
  columns: string[]
}

/**
 * Public chart view page. Fetches a v2 chart by ID and renders with Observable Plot.
 * Includes sharing controls (URL, embed, SVG/PNG/PDF export).
 */
export function ChartViewPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartId) return

    setLoading(true)
    setError(null)

    const abortController = new AbortController()
    fetch(`/api/v2/charts/${chartId}`, { signal: abortController.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(body.detail ?? `Failed to load chart: ${res.status}`)
        }
        return res.json()
      })
      .then((data: ChartData) => {
        setChartData(data)
        setLoading(false)
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => abortController.abort()
  }, [chartId])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading chart...</p>
        </div>
      </div>
    )
  }

  if (error || !chartData) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md text-center">
          <p className="text-sm text-red-700 font-medium">Chart not found</p>
          <p className="text-sm text-red-600 mt-1">{error ?? 'Unknown error'}</p>
          <Link to="/library" className="text-sm text-blue-600 underline mt-3 inline-block">
            Browse library
          </Link>
        </div>
      </div>
    )
  }

  const { chart, data } = chartData
  const chartType = (chart.chart_type ?? 'BarChart') as ChartType

  // Map API response → ChartConfig (apply same multi-Y logic as EditorPage)
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
    metricLabel: (chart.config?.metricLabel as string) ?? undefined,
    unitColumn: (chart.config?.unitColumn as string) ?? undefined,
  }

  // Apply palette colors
  const palette = (chart.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default px-6 py-3 flex items-center justify-between">
        <Link to="/library" className="text-sm text-text-secondary hover:text-text-on-surface transition-colors">
          &larr; Library
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to={`/editor/${chartId}`}
            className="text-sm px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
          >
            Edit
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Chart */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div ref={chartRef}>
          <ChartWrapper
            title={chart.title ?? undefined}
            subtitle={chart.subtitle ?? undefined}
            source={chart.source ?? undefined}
            sourceUrl={(chart.config?.sourceUrl as string) ?? undefined}
          >
            <ObservableChartFactory
              data={data}
              config={chartConfig}
              chartType={chartType}
              height={450}
            />
          </ChartWrapper>
        </div>

        {/* Sharing controls */}
        <div className="mt-4 flex justify-end">
          <SharePanel
            chartId={chart.id}
            title={chart.title ?? undefined}
            source={chart.source ?? undefined}
            chartRef={chartRef}
          />
        </div>
      </main>
    </div>
  )
}
