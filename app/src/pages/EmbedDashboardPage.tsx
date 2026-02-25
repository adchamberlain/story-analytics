import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { DashboardGrid } from '../components/dashboard/DashboardGrid'
import { parseEmbedFlags } from '../utils/embedFlags'

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
  layout?: { x: number; y: number; w: number; h: number } | null
}

interface DashboardData {
  id: string
  title: string
  description: string | null
  charts: ChartWithData[]
  created_at: string
  updated_at: string
  has_stale_data: boolean
}

/**
 * Minimal embed view for dashboards. No navigation, no header, no editor UI.
 * Fetches from the public endpoint, renders DashboardGrid in read-only mode.
 * Sends PostMessage to parent for iframe auto-resize.
 */
export function EmbedDashboardPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const [searchParams] = useSearchParams()
  const flags = parseEmbedFlags(searchParams)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Fetch dashboard data from public endpoint
  useEffect(() => {
    if (!dashboardId) return
    fetch(`/api/v2/dashboards/${dashboardId}/public`)
      .then(async (res) => {
        if (res.status === 403) throw new Error('This dashboard is not published')
        if (!res.ok) throw new Error('Dashboard not found')
        return res.json()
      })
      .then(setDashboard)
      .catch((e) => setError(e.message))
  }, [dashboardId])

  // PostMessage height to parent for iframe auto-resize
  useEffect(() => {
    if (!dashboard) return
    const sendHeight = () => {
      const height = document.body.scrollHeight
      window.parent.postMessage({ type: 'sa-resize', height }, '*')
    }
    // Send after render
    const timer = setTimeout(sendHeight, 200)
    // Observe for size changes
    const observer = new ResizeObserver(sendHeight)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [dashboard])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#666', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#999', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        padding: flags.plain ? '0' : '16px 24px',
        fontFamily: 'system-ui',
        backgroundColor: flags.transparent
          ? 'transparent'
          : isDark ? '#0f172a' : undefined,
        color: isDark ? '#e2e8f0' : undefined,
      }}
      data-theme={isDark ? 'dark' : 'light'}
    >
      {!flags.plain && dashboard.title && (
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: isDark ? '#f1f5f9' : '#1a1a1a' }}>
          {dashboard.title}
        </h1>
      )}
      {!flags.plain && dashboard.description && (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: isDark ? '#94a3b8' : '#666' }}>
          {dashboard.description}
        </p>
      )}
      <div style={flags.static ? { pointerEvents: 'none' } : undefined}>
        <DashboardGrid charts={dashboard.charts} embedFlags={flags} />
      </div>
    </div>
  )
}
