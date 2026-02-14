import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface DashboardSummary {
  id: string
  title: string
  description: string | null
  chart_count: number
  created_at: string
  updated_at: string
}

export function DashboardsHome() {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v2/dashboards/')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(body.detail ?? `Failed to load dashboards: ${res.status}`)
        }
        return res.json()
      })
      .then((data: DashboardSummary[]) => {
        setDashboards(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading dashboards...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Dashboards</h1>
      </div>

      {dashboards.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-text-secondary">No dashboards yet.</p>
          <Link
            to="/dashboard/new"
            className="mt-3 inline-block text-sm text-blue-600 underline hover:text-blue-800"
          >
            Create your first dashboard
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {dashboards.map((d) => (
            <DashboardCard key={d.id} dashboard={d} />
          ))}
        </div>
      )}
    </div>
  )
}

function DashboardCard({ dashboard }: { dashboard: DashboardSummary }) {
  const date = new Date(dashboard.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Link
      to={`/dashboard/${dashboard.id}`}
      className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col hover:border-gray-300 transition-colors"
    >
      <h3 className="text-sm font-semibold text-text-primary mb-1 line-clamp-2">
        {dashboard.title || 'Untitled'}
      </h3>
      {dashboard.description && (
        <p className="text-xs text-text-secondary mb-3 line-clamp-2">
          {dashboard.description}
        </p>
      )}
      <div className="flex-1" />
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <span className="text-xs text-text-muted">
          {dashboard.chart_count} chart{dashboard.chart_count !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-text-muted">{date}</span>
      </div>
    </Link>
  )
}
