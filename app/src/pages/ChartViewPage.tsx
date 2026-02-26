import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { authFetch } from '../utils/authFetch'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { ChartShareModal } from '../components/sharing/ChartShareModal'
import { DeployPopover } from '../components/DeployPrompt'
import { useAuthStore } from '../stores/authStore'
import { buildChartConfig } from '../utils/buildChartConfig'
import type { ChartType } from '../types/chart'

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
    status: string
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
  const [searchParams] = useSearchParams()
  const dashboardId = searchParams.get('dashboard')
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDeployPrompt, setShowDeployPrompt] = useState(false)
  const { authEnabled, user, loading: authLoading, checkStatus } = useAuthStore()

  // Resolve auth state (page is outside AuthGate)
  useEffect(() => { checkStatus() }, [checkStatus])

  useEffect(() => {
    if (!chartId || authLoading) return

    setLoading(true)
    setError(null)

    const abortController = new AbortController()
    const fetchFn = user
      ? authFetch(`/api/v2/charts/${chartId}`, { signal: abortController.signal })
      : fetch(`/api/v2/charts/${chartId}`, { signal: abortController.signal })

    fetchFn
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
  }, [chartId, user, authLoading])

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

  // Map API response → ChartConfig (shared helper handles all fields + palette)
  const chartConfig = buildChartConfig(chart)

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default px-6 py-3 flex items-center justify-between">
        {user ? (
          <div className="flex items-center gap-4">
            {dashboardId && (
              <Link to={`/dashboard/${dashboardId}`} className="text-sm text-text-secondary hover:text-text-on-surface transition-colors">
                &larr; Dashboard
              </Link>
            )}
            <Link to="/library" className="text-sm text-text-secondary hover:text-text-on-surface transition-colors">
              {dashboardId ? 'Library' : <>&larr; Library</>}
            </Link>
          </div>
        ) : (
          <span />
        )}
        {user && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => authEnabled ? setShowShareModal(true) : setShowDeployPrompt(p => !p)}
                className="text-sm px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
              >
                Share
              </button>
              {showDeployPrompt && (
                <DeployPopover onClose={() => setShowDeployPrompt(false)} />
              )}
            </div>
            <Link
              to={`/editor/${chartId}`}
              className="text-sm px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
            >
              Edit
            </Link>
          </div>
        )}
      </header>

      {/* Chart */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div>
          <ChartWrapper
            title={chart.title ?? undefined}
            subtitle={chart.subtitle ?? undefined}
            source={chart.source ?? undefined}
            sourceUrl={(chart.config?.sourceUrl as string) ?? undefined}
            chartId={chart.id}
            allowDataDownload={(chart.config?.allowDataDownload as boolean) !== false}
          >
            <ObservableChartFactory
              data={data}
              config={chartConfig}
              chartType={chartType}
              height={450}
            />
          </ChartWrapper>
        </div>

      </main>

      {showShareModal && (
        <ChartShareModal
          chartId={chart.id}
          status={chart.status}
          onClose={() => setShowShareModal(false)}
          onStatusChange={(newStatus) => {
            setChartData((prev) =>
              prev ? { ...prev, chart: { ...prev.chart, status: newStatus } } : prev
            )
          }}
        />
      )}
    </div>
  )
}
