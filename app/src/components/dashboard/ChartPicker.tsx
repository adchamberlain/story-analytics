import { useEffect, useState } from 'react'
import { authFetch } from '../../utils/authFetch'

interface PickerChart {
  id: string
  chart_type: string
  title: string
  subtitle: string | null
  updated_at: string
}

interface ChartPickerProps {
  /** IDs of charts already in the dashboard */
  excludeIds: string[]
  onAdd: (chartId: string) => void
  onCreateNew?: () => void
  onClose: () => void
}

const CHART_TYPE_LABELS: Record<string, string> = {
  BarChart: 'Bar',
  LineChart: 'Line',
  AreaChart: 'Area',
  ScatterPlot: 'Scatter',
  Histogram: 'Histogram',
  BigValue: 'KPI',
  DataTable: 'Table',
}

/**
 * Modal overlay to pick charts from the library and add them to a dashboard.
 */
export function ChartPicker({ excludeIds, onAdd, onCreateNew, onClose }: ChartPickerProps) {
  const [charts, setCharts] = useState<PickerChart[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const abortController = new AbortController()
    authFetch('/api/v2/charts/', { signal: abortController.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Charts fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: PickerChart[]) => {
        setCharts(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setLoading(false)
      })
    return () => abortController.abort()
  }, [])

  const excludeSet = new Set(excludeIds)
  const filtered = charts.filter((c) => {
    if (excludeSet.has(c.id)) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return c.title.toLowerCase().includes(q) || (c.subtitle?.toLowerCase().includes(q) ?? false)
    }
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={onClose}>
      <div
        className="bg-surface-raised rounded-2xl shadow-xl w-full flex flex-col border border-border-default"
        style={{ maxWidth: '540px', maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border-default"
          style={{ padding: '20px 28px' }}
        >
          <h2 className="text-[17px] font-semibold text-text-primary">Add Chart</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
            style={{ width: '36px', height: '36px' }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create New */}
        {onCreateNew && (
          <div style={{ padding: '16px 28px' }} className="border-b border-border-subtle">
            <button
              onClick={onCreateNew}
              className="w-full text-left rounded-xl border-2 border-dashed transition-colors"
              style={{
                padding: '16px 20px',
                borderColor: 'rgba(59,130,246,0.35)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'
                e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.35)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <p className="text-[15px] font-medium" style={{ color: '#3b82f6' }}>+ Create New Chart</p>
              <p className="text-[13px] text-text-secondary" style={{ marginTop: '4px' }}>Pick a data source and build a chart</p>
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: '16px 28px' }} className="border-b border-border-subtle">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-muted pointer-events-none" style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search charts..."
              className="w-full text-[15px] border border-border-default rounded-xl bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              style={{ padding: '11px 16px 11px 42px' }}
              autoFocus
            />
          </div>
        </div>

        {/* Chart list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 28px 20px' }}>
          {loading ? (
            <div className="flex items-center justify-center" style={{ padding: '40px 0' }}>
              <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[15px] text-center text-text-secondary" style={{ padding: '40px 0' }}>
              {charts.length === 0 ? 'No charts available. Create some first.' : 'No matching charts.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filtered.map((chart) => (
                <button
                  key={chart.id}
                  onClick={() => onAdd(chart.id)}
                  className="w-full text-left rounded-xl border border-border-default hover:border-blue-400 transition-all flex items-center justify-between group"
                  style={{ padding: '14px 20px' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div>
                    <p className="text-[15px] font-medium text-text-primary">
                      {chart.title || 'Untitled'}
                    </p>
                    <p className="text-[13px] text-text-muted" style={{ marginTop: '2px' }}>
                      {CHART_TYPE_LABELS[chart.chart_type] ?? chart.chart_type}
                      {chart.subtitle ? ` — ${chart.subtitle}` : ''}
                    </p>
                  </div>
                  <span
                    className="text-[13px] font-medium shrink-0 rounded-lg transition-colors"
                    style={{ color: '#3b82f6', padding: '6px 14px', marginLeft: '12px' }}
                  >
                    + Add
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
