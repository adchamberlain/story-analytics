import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard'

interface DashboardSummary {
  id: string
  title: string
  description: string | null
  charts: { chart_id: string }[]
  created_at: string
  updated_at: string
}

export function DashboardsHome() {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('onboarding_complete') === 'true'
  )

  useEffect(() => {
    const abortController = new AbortController()
    fetch('/api/v2/dashboards/', { signal: abortController.signal })
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
        if (e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => abortController.abort()
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
      <div style={{ padding: '48px 64px' }}>
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '48px 64px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '40px' }}>
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Dashboards</h1>
      </div>

      {dashboards.length === 0 && !onboardingDismissed ? (
        <OnboardingWizard onDismiss={() => {
          localStorage.setItem('onboarding_complete', 'true')
          setOnboardingDismissed(true)
        }} />
      ) : dashboards.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border-default rounded-xl">
          <svg className="mx-auto h-12 w-12 text-text-icon mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <h2 className="text-base font-semibold text-text-primary mb-1">No dashboards yet</h2>
          <p className="text-sm text-text-secondary mb-5">Upload data and create your first chart.</p>
          <Link
            to="/sources"
            className="inline-flex items-center px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            + Add Data Source
          </Link>
        </div>
      ) : (
        <div className="grid gap-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
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
  const isPinned = localStorage.getItem('pinnedDashboardId') === dashboard.id

  return (
    <Link
      to={`/dashboard/${dashboard.id}`}
      className="bg-surface-raised rounded-2xl border border-border-default shadow-card hover:shadow-card-hover flex flex-col transition-all hover:-translate-y-0.5"
      style={{ padding: '28px 32px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-text-primary mb-2 line-clamp-2 leading-snug">
          {dashboard.title || 'Untitled'}
        </h3>
        {isPinned && (
          <svg className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
          </svg>
        )}
      </div>
      {dashboard.description && (
        <p className="text-[15px] text-text-secondary mb-4 line-clamp-2 leading-relaxed">
          {dashboard.description}
        </p>
      )}
      <div className="flex-1" />
      <div className="flex items-center justify-between" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border-subtle)' }}>
        <span className="text-[13px] text-text-muted">
          {dashboard.charts.length} chart{dashboard.charts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[13px] text-text-muted">{date}</span>
      </div>
    </Link>
  )
}
