import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DashboardGrid } from '../components/dashboard/DashboardGrid'
import { ShareModal } from '../components/sharing/ShareModal'
import { formatTimeAgo } from '../utils/formatters'

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
  data_ingested_at: string | null
  freshness: string | null
  // 11.3: Schema change detection
  error_type: string | null
  error_suggestion: string | null
  // 11.4: Health status
  health_status: string
  health_issues: string[]
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

interface HealthCheckResult {
  dashboard_id: string
  checked_at: string
  charts: { chart_id: string; health_status: string; health_issues: string[] }[]
  overall_status: string
}

/**
 * Public dashboard view. Fetches dashboard with chart data from v2 API
 * and renders all charts in a responsive grid.
 */
export function DashboardViewPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const refreshErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Health check state
  const [healthChecking, setHealthChecking] = useState(false)
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null)

  // Pin state
  const [isPinned, setIsPinned] = useState(() => localStorage.getItem('pinnedDashboardId') === dashboardId)

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false)

  const fetchDashboard = useCallback(async (isRefresh: boolean) => {
    if (!dashboardId) return

    if (isRefresh) {
      setRefreshing(true)
      setRefreshError(null)
    } else {
      setLoading(true)
      setError(null)
    }

    try {
      const res = await fetch(`/api/v2/dashboards/${dashboardId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Failed to load dashboard: ${res.status}`)
      }
      const data: DashboardData = await res.json()
      setDashboard(data)
      setLastRefreshed(new Date())
      if (!isRefresh) setLoading(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isRefresh) {
        setRefreshError(msg)
        // Auto-dismiss after 5 seconds
        if (refreshErrorTimerRef.current) clearTimeout(refreshErrorTimerRef.current)
        refreshErrorTimerRef.current = setTimeout(() => setRefreshError(null), 5000)
      } else {
        setError(msg)
        setLoading(false)
      }
    } finally {
      if (isRefresh) setRefreshing(false)
    }
  }, [dashboardId])

  // Initial load
  useEffect(() => {
    fetchDashboard(false)
  }, [fetchDashboard])

  // Tick every 30s to keep timestamp display fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Cleanup error timer on unmount
  useEffect(() => {
    return () => {
      if (refreshErrorTimerRef.current) clearTimeout(refreshErrorTimerRef.current)
    }
  }, [])

  const handleRefresh = () => {
    if (!refreshing) fetchDashboard(true)
  }

  const handleTogglePin = () => {
    if (isPinned) {
      localStorage.removeItem('pinnedDashboardId')
      setIsPinned(false)
    } else {
      localStorage.setItem('pinnedDashboardId', dashboardId!)
      setIsPinned(true)
    }
  }

  const handleHealthCheck = async () => {
    if (!dashboardId || healthChecking) return
    setHealthChecking(true)
    setHealthResult(null)
    try {
      const res = await fetch(`/api/v2/dashboards/${dashboardId}/health-check`, {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error('Health check failed')
      }
      const data: HealthCheckResult = await res.json()
      setHealthResult(data)
    } catch {
      setHealthResult(null)
    } finally {
      setHealthChecking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    // Stale pin cleanup: if this dashboard 404'd and it's pinned, clear the pin
    if (dashboardId && localStorage.getItem('pinnedDashboardId') === dashboardId) {
      localStorage.removeItem('pinnedDashboardId')
    }
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md text-center">
          <p className="text-sm text-red-700 font-medium">Dashboard not found</p>
          <p className="text-sm text-red-600 mt-1">{error ?? 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  const issueCount = healthResult
    ? healthResult.charts.filter((c) => c.health_status !== 'healthy').length
    : 0

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default shadow-sm px-6 py-3 flex items-center justify-between">
        <Link to="/dashboards" className="text-sm text-text-secondary hover:text-text-on-surface transition-colors">
          &larr; Dashboards
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleHealthCheck}
            disabled={healthChecking}
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {healthChecking ? (
              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Health Check
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors flex items-center gap-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <a
            href={`/api/v2/dashboards/${dashboardId}/export/html`}
            download
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors flex items-center gap-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export HTML
          </a>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 15.5A7.5 7.5 0 0118 7.05M18.5 8.5A7.5 7.5 0 016 16.95" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleTogglePin}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
              isPinned
                ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100'
                : 'border-border-default text-text-on-surface hover:bg-surface-secondary'
            }`}
            title={isPinned ? 'Unpin from home' : 'Pin as home dashboard'}
          >
            <svg className="h-3.5 w-3.5" fill={isPinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
            </svg>
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
          <Link
            to={`/dashboard/${dashboardId}/edit`}
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
          >
            Edit
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Title + description */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-text-primary">
            {dashboard.title}
          </h1>
          {dashboard.description && (
            <p className="text-sm mt-1 text-text-secondary">
              {dashboard.description}
            </p>
          )}
        </div>

        {/* Last refreshed timestamp */}
        {lastRefreshed && (
          <p className="text-xs text-text-muted mb-6">
            Updated {formatTimeAgo(lastRefreshed)}
          </p>
        )}

        {/* Stale data banner */}
        {dashboard.has_stale_data && (
          <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <p className="text-sm text-amber-700">
              Some charts have stale data (over 24 hours old).
            </p>
            <button
              onClick={handleRefresh}
              className="text-sm text-amber-700 underline hover:text-amber-900 ml-4"
            >
              Refresh now
            </button>
          </div>
        )}

        {/* Health check result banner */}
        {healthResult && (
          <div
            className={`mb-4 flex items-center justify-between rounded-lg px-4 py-2.5 border ${
              healthResult.overall_status === 'healthy'
                ? 'bg-green-50 border-green-200'
                : healthResult.overall_status === 'warning'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            <p
              className={`text-sm ${
                healthResult.overall_status === 'healthy'
                  ? 'text-green-700'
                  : healthResult.overall_status === 'warning'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {healthResult.overall_status === 'healthy'
                ? 'All charts healthy'
                : `${issueCount} chart${issueCount !== 1 ? 's' : ''} with issues`}
            </p>
            <button
              onClick={() => setHealthResult(null)}
              className="text-text-icon hover:text-text-icon-hover ml-4"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Refresh error banner */}
        {refreshError && (
          <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-700">Refresh failed: {refreshError}</p>
            <button
              onClick={() => setRefreshError(null)}
              className="text-red-400 hover:text-red-600 ml-4"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Chart grid with refresh overlay */}
        <div ref={gridRef} className="relative">
          <div className={refreshing ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
            <DashboardGrid charts={dashboard.charts} dashboardId={dashboardId} />
          </div>
          {refreshing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-surface-raised rounded-lg shadow-lg px-6 py-4 flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-text-on-surface">Refreshing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Share controls */}
        {dashboardId && (
          <div className="mt-6 flex justify-end">
            <DashboardShareLinks dashboardId={dashboardId} />
          </div>
        )}
      </main>

      {/* Share modal */}
      {showShareModal && dashboardId && (
        <ShareModal dashboardId={dashboardId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  )
}

// ── Dashboard Share Links (simpler than chart SharePanel) ───────────────────

function DashboardShareLinks({ dashboardId }: { dashboardId: string }) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  const url = `${window.location.origin}/dashboard/${dashboardId}`
  const embedCode = `<iframe src="${url}" width="100%" height="800" frameborder="0"></iframe>`

  const copy = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const btnClass = 'text-xs px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors'
  const successClass = 'text-xs px-3 py-1.5 rounded border border-green-300 text-green-700 bg-green-50'

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => copy(url, setCopiedUrl)} className={copiedUrl ? successClass : btnClass}>
        {copiedUrl ? 'Copied!' : 'Copy URL'}
      </button>
      <button onClick={() => copy(embedCode, setCopiedEmbed)} className={copiedEmbed ? successClass : btnClass}>
        {copiedEmbed ? 'Copied!' : 'Embed'}
      </button>
    </div>
  )
}
