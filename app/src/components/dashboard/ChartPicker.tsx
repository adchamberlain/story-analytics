import { useEffect, useState } from 'react'

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
export function ChartPicker({ excludeIds, onAdd, onClose }: ChartPickerProps) {
  const [charts, setCharts] = useState<PickerChart[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/v2/charts/')
      .then((res) => res.json())
      .then((data: PickerChart[]) => {
        setCharts(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Add Chart</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search charts..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            autoFocus
          />
        </div>

        {/* Chart list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-center py-8" style={{ color: '#666' }}>Loading charts...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#666' }}>
              {charts.length === 0 ? 'No charts available. Create some first.' : 'No matching charts.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((chart) => (
                <button
                  key={chart.id}
                  onClick={() => onAdd(chart.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                      {chart.title || 'Untitled'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#999' }}>
                      {CHART_TYPE_LABELS[chart.chart_type] ?? chart.chart_type}
                      {chart.subtitle ? ` — ${chart.subtitle}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">+ Add</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
