import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DashboardGrid } from '../components/dashboard/DashboardGrid'

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

interface DashboardData {
  id: string
  title: string
  description: string | null
  charts: ChartWithData[]
  created_at: string
  updated_at: string
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
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dashboardId) return

    setLoading(true)
    setError(null)

    fetch(`/api/v2/dashboards/${dashboardId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(body.detail ?? `Failed to load dashboard: ${res.status}`)
        }
        return res.json()
      })
      .then((data: DashboardData) => {
        setDashboard(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [dashboardId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md text-center">
          <p className="text-sm text-red-700 font-medium">Dashboard not found</p>
          <p className="text-sm text-red-600 mt-1">{error ?? 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Dashboards
        </Link>
        <Link
          to={`/dashboard/${dashboardId}/edit`}
          className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Edit
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Title + description */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary">
            {dashboard.title}
          </h1>
          {dashboard.description && (
            <p className="text-sm mt-1 text-text-secondary">
              {dashboard.description}
            </p>
          )}
        </div>

        {/* Chart grid */}
        <div ref={gridRef}>
          <DashboardGrid charts={dashboard.charts} />
        </div>

        {/* Share controls */}
        {dashboardId && (
          <div className="mt-6 flex justify-end">
            <DashboardShareLinks dashboardId={dashboardId} />
          </div>
        )}
      </main>
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

  const btnClass = 'text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors'
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
