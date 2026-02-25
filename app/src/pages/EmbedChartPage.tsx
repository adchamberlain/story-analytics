import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
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

/** Format staleness age into a human-readable string. */
function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Minimal embed view for charts. No navigation, no header, no footer.
 * Just the chart with optional title/source. Sends PostMessage to parent
 * with height for auto-resize.
 */
export function EmbedChartPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [searchParams] = useSearchParams()
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null)
  const [displayAge, setDisplayAge] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Dark mode: ?theme=dark|light|auto (default: auto)
  const themeParam = searchParams.get('theme') || 'auto'
  const [isDark, setIsDark] = useState(() => {
    if (themeParam === 'dark') return true
    if (themeParam === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (themeParam !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeParam])

  // Listen for parent PostMessage theme override
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'sa-theme') {
        const theme = event.data.theme
        if (theme === 'dark') setIsDark(true)
        else if (theme === 'light') setIsDark(false)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Fetch chart data
  useEffect(() => {
    if (!chartId) return
    fetch(`/api/v2/charts/${chartId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Chart not found')
        return res.json()
      })
      .then((data) => {
        setChartData(data)
        setLastRefreshed(Date.now())
      })
      .catch((e) => setError(e.message))
  }, [chartId])

  // Auto-refresh polling: re-fetch chart data at configured interval
  useEffect(() => {
    if (!chartData) return
    const interval = chartData.chart.config?.refreshInterval as number
    if (!interval || interval <= 0) return

    const timer = setInterval(() => {
      fetch(`/api/v2/charts/${chartId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setChartData(data)
            setLastRefreshed(Date.now())
          }
        })
        .catch(() => {}) // silent retry on next interval
    }, interval * 1000)

    return () => clearInterval(timer)
  }, [chartData?.chart.config?.refreshInterval, chartId])

  // Update displayed staleness age every 10s
  useEffect(() => {
    if (!lastRefreshed) return
    const tick = () => {
      const age = Math.floor((Date.now() - lastRefreshed) / 1000)
      setDisplayAge(formatAge(age))
    }
    tick()
    const timer = setInterval(tick, 10_000)
    return () => clearInterval(timer)
  }, [lastRefreshed])

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

  // Set og:image meta tag for social previews
  useEffect(() => {
    if (!chartId) return
    const ogUrl = `/api/v2/charts/${chartId}/snapshot.png`
    let meta = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('property', 'og:image')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', ogUrl)
    return () => {
      meta?.remove()
    }
  }, [chartId])

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
    <div
      ref={containerRef}
      style={{
        padding: '12px 16px',
        fontFamily: 'system-ui',
        backgroundColor: isDark ? '#0f172a' : undefined,
        color: isDark ? '#e2e8f0' : undefined,
      }}
      data-theme={isDark ? 'dark' : 'light'}
    >
      {chart.title && (
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: isDark ? '#f1f5f9' : '#1a1a1a' }}>
          {chart.title}
        </h2>
      )}
      {chart.subtitle && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: isDark ? '#94a3b8' : '#666' }}>
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
        <p style={{ margin: '8px 0 0', fontSize: 11, color: isDark ? '#64748b' : '#999' }}>
          Source: {chart.source}
        </p>
      )}
      <noscript>
        <img
          src={`/api/v2/charts/${chartId}/snapshot.png`}
          alt={chart.title || 'Chart'}
          style={{ maxWidth: '100%' }}
        />
      </noscript>
      {displayAge != null && Number(chart.config?.refreshInterval) > 0 && (
        <p data-testid="staleness-indicator" style={{ margin: '4px 0 0', fontSize: 10, color: isDark ? '#475569' : '#bbb' }}>
          Updated {displayAge}
        </p>
      )}
    </div>
  )
}
