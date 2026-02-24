import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig, ChartType } from '../types/chart'
import type { PaletteKey } from '../themes/plotTheme'

interface ChartData {
  chart: {
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
 * Minimal embed view for charts. No navigation, no header, no footer.
 * Just the chart with optional title/source. Sends PostMessage to parent
 * with height for auto-resize.
 */
export function EmbedChartPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch chart data
  useEffect(() => {
    if (!chartId) return
    fetch(`/api/v2/charts/${chartId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Chart not found')
        return res.json()
      })
      .then(setChartData)
      .catch((e) => setError(e.message))
  }, [chartId])

  // PostMessage height to parent for iframe auto-resize
  useEffect(() => {
    if (!chartData) return
    const sendHeight = () => {
      const height = document.body.scrollHeight
      window.parent.postMessage({ type: 'sa-resize', height }, '*')
    }
    // Send after render
    const timer = setTimeout(sendHeight, 100)
    // Observe for size changes
    const observer = new ResizeObserver(sendHeight)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [chartData])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#666', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  if (!chartData) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#999', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  const { chart, data } = chartData
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
    <div ref={containerRef} style={{ padding: '12px 16px', fontFamily: 'system-ui' }}>
      {chart.title && (
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>
          {chart.title}
        </h2>
      )}
      {chart.subtitle && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>
          {chart.subtitle}
        </p>
      )}
      <ObservableChartFactory
        data={data}
        config={chartConfig}
        chartType={chart.chart_type as ChartType}
        height={360}
      />
      {chart.source && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#999' }}>
          Source: {chart.source}
        </p>
      )}
    </div>
  )
}
