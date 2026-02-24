import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../stores/libraryStore'
import type { SortField, LibraryChart } from '../stores/libraryStore'

// SVG icons for each chart type
function BarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="8" width="3" height="7" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="6" y="4" width="3" height="11" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="11" y="1" width="3" height="14" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <polyline points="1,12 5,7 9,9 15,2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M1 12 L5 7 L9 9 L15 3 V15 H1 Z" fill="currentColor" opacity="0.2" />
      <polyline points="1,12 5,7 9,9 15,3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ScatterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="3" cy="11" r="1.5" fill="currentColor" />
      <circle cx="6" cy="6" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="10" cy="9" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="13" cy="3" r="1.5" fill="currentColor" />
    </svg>
  )
}

function HistogramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="10" width="2.5" height="5" fill="currentColor" opacity="0.4" />
      <rect x="4" y="6" width="2.5" height="9" fill="currentColor" opacity="0.6" />
      <rect x="7" y="2" width="2.5" height="13" fill="currentColor" />
      <rect x="10" y="5" width="2.5" height="10" fill="currentColor" opacity="0.7" />
      <rect x="13" y="9" width="2.5" height="6" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

function KpiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <text x="2" y="13" fontSize="13" fontWeight="700" fill="currentColor" fontFamily="system-ui">#</text>
    </svg>
  )
}

function TableIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1" y1="5.5" x2="15" y2="5.5" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="6" y1="1" x2="6" y2="15" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
    </svg>
  )
}

function HeatMapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.2" />
      <rect x="6" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="11" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="1" y="6" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="11" y="6" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="1" y="11" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="6" y="11" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="11" y="11" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.1" />
    </svg>
  )
}

function PieIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M8 1 A7 7 0 0 1 14.9 10 L8 8 Z" fill="currentColor" />
      <path d="M14.9 10 A7 7 0 0 1 3 13.5 L8 8 Z" fill="currentColor" opacity="0.5" />
      <path d="M3 13.5 A7 7 0 0 1 8 1 L8 8 Z" fill="currentColor" opacity="0.25" />
    </svg>
  )
}

function DefaultIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

const CHART_TYPE_META: Record<string, { label: string; Icon: () => JSX.Element; fg: string; bg: string }> = {
  BarChart:    { label: 'Bar',       Icon: BarIcon,       fg: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  LineChart:   { label: 'Line',      Icon: LineIcon,      fg: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  AreaChart:   { label: 'Area',      Icon: AreaIcon,      fg: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  ScatterPlot: { label: 'Scatter',   Icon: ScatterIcon,   fg: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  Histogram:   { label: 'Histogram', Icon: HistogramIcon, fg: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  BigValue:    { label: 'KPI',       Icon: KpiIcon,       fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  DataTable:   { label: 'Table',     Icon: TableIcon,     fg: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  HeatMap:     { label: 'HeatMap',   Icon: HeatMapIcon,   fg: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  BoxPlot:     { label: 'BoxPlot',   Icon: BarIcon,       fg: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  PieChart:    { label: 'Pie',       Icon: PieIcon,       fg: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  Treemap:     { label: 'Treemap',   Icon: HeatMapIcon,   fg: '#84cc16', bg: 'rgba(132,204,22,0.12)' },
  ChoroplethMap: { label: 'Map',    Icon: DefaultIcon,   fg: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
}

/**
 * Chart library: grid of saved charts with search, type filter, and sort.
 */
export function LibraryPage() {
  const store = useLibraryStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    store.loadCharts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const charts = store.filteredCharts()
  const chartTypes = [...new Set(store.charts.map((c) => c.chart_type))].sort()

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const allVisibleSelected = charts.length > 0 && charts.every((c) => selectedIds.has(c.id))
    if (allVisibleSelected) {
      // Remove only the currently visible IDs (preserve selections from other filters)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of charts) next.delete(c.id)
        return next
      })
    } else {
      // Add all visible IDs to the selection
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of charts) next.add(c.id)
        return next
      })
    }
  }

  const handleDuplicate = async (chartId: string) => {
    setDuplicatingId(chartId)
    try {
      await store.duplicateChart(chartId)
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async (chartId: string) => {
    setDeletingId(chartId)
    setConfirmingId(null)
    try {
      await store.deleteChart(chartId)
    } catch {
      // deleteChart handles its own error state in the store
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      for (const id of selectedIds) {
        await store.deleteChart(id)
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      setBulkConfirm(false)
    } catch {
      // Individual failures handled by store
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div style={{ padding: '48px 64px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '40px' }}>
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Chart Library</h1>
        <div className="flex items-center gap-4">
          <Link
            to="/editor/new/source"
            className="text-[14px] font-medium rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors inline-flex items-center gap-1.5"
            style={{ padding: '7px 16px' }}
          >
            + New Chart
          </Link>
          {charts.length > 0 && (
            <button
              onClick={() => { if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); setBulkConfirm(false) } else setSelectMode(true) }}
              className="text-[14px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {selectMode ? 'Cancel selection' : 'Select'}
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div
          className="flex items-center gap-4 bg-surface-raised border border-border-default rounded-xl"
          style={{ padding: '12px 20px', marginBottom: '24px' }}
        >
          <button
            onClick={selectAll}
            className="text-[14px] font-medium text-blue-500 hover:text-blue-400 transition-colors"
          >
            {charts.length > 0 && charts.every((c) => selectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-[14px] text-text-secondary">
            {selectedIds.size} chart{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          {bulkConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-red-400 font-medium">
                Delete {selectedIds.size} chart{selectedIds.size !== 1 ? 's' : ''}?
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="text-[13px] px-4 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
              >
                {bulkDeleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setBulkConfirm(false)}
                className="text-[13px] px-4 py-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBulkConfirm(true)}
              className="text-[13px] px-4 py-1.5 rounded-lg text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 transition-colors font-medium"
            >
              Delete selected
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4" style={{ marginBottom: '36px' }}>
        <div className="relative flex-1 min-w-[240px]">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={store.search}
            onChange={(e) => store.setSearch(e.target.value)}
            placeholder="Search charts..."
            className="w-full text-[15px] border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface-raised text-text-primary placeholder:text-text-muted transition-colors"
            style={{ padding: '12px 16px 12px 44px' }}
          />
        </div>
        <select
          value={store.typeFilter ?? ''}
          onChange={(e) => store.setTypeFilter(e.target.value || null)}
          className="text-[15px] border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface-raised text-text-primary transition-colors appearance-none cursor-pointer"
          style={{ padding: '12px 40px 12px 16px', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 6l3.5 4 3.5-4z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
        >
          <option value="">All types</option>
          {chartTypes.map((type) => (
            <option key={type} value={type}>
              {CHART_TYPE_META[type]?.label ?? type}
            </option>
          ))}
        </select>
        <select
          value={store.sortBy}
          onChange={(e) => store.setSortBy(e.target.value as SortField)}
          className="text-[15px] border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface-raised text-text-primary transition-colors appearance-none cursor-pointer"
          style={{ padding: '12px 40px 12px 16px', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 6l3.5 4 3.5-4z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
        >
          <option value="updated_at">Last modified</option>
          <option value="created_at">Date created</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Content */}
      {store.loading ? (
        <div className="text-center" style={{ padding: '96px 0' }}>
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[15px] text-text-secondary">Loading charts...</p>
        </div>
      ) : store.error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-5 text-center">
          <p className="text-[15px] text-red-700">{store.error}</p>
        </div>
      ) : charts.length === 0 ? (
        <div className="text-center border-2 border-dashed border-border-default rounded-2xl" style={{ padding: '96px 0' }}>
          <svg className="mx-auto h-14 w-14 text-text-icon mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            {store.search || store.typeFilter ? 'No charts match your filters' : 'No charts yet'}
          </h2>
          {!store.search && !store.typeFilter && (
            <>
              <p className="text-[15px] text-text-secondary mb-6">Upload a data source and create your first chart.</p>
              <Link
                to="/editor/new/source"
                className="inline-flex items-center px-6 py-3 text-[15px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                + New Chart
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
          {charts.map((chart) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              deleting={deletingId === chart.id}
              confirming={confirmingId === chart.id}
              duplicating={duplicatingId === chart.id}
              onRequestDelete={() => setConfirmingId(chart.id)}
              onConfirmDelete={() => handleDelete(chart.id)}
              onCancelDelete={() => setConfirmingId(null)}
              onDuplicate={() => handleDuplicate(chart.id)}
              selectMode={selectMode}
              selected={selectedIds.has(chart.id)}
              onToggleSelect={() => toggleSelect(chart.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({
  chart,
  deleting,
  confirming,
  duplicating,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onDuplicate,
  selectMode,
  selected,
  onToggleSelect,
}: {
  chart: LibraryChart
  deleting: boolean
  confirming: boolean
  duplicating: boolean
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDuplicate: () => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
}) {
  const meta = CHART_TYPE_META[chart.chart_type] ?? { label: chart.chart_type, Icon: DefaultIcon, fg: '#64748b', bg: 'rgba(100,116,139,0.12)' }
  const { Icon } = meta
  const date = new Date(chart.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  // In select mode, clicking the card toggles selection
  if (selectMode) {
    return (
      <div
        onClick={onToggleSelect}
        className={`bg-surface-raised rounded-2xl border-2 shadow-card flex flex-col transition-all cursor-pointer ${
          selected ? 'border-blue-500' : 'border-border-default hover:border-border-strong'
        }`}
        style={{ padding: '28px 32px' }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
          <span
            className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full font-medium"
            style={{ color: meta.fg, backgroundColor: meta.bg }}
          >
            <Icon />
            {meta.label}
          </span>
          {/* Checkbox */}
          <div
            className={`flex items-center justify-center rounded-md transition-colors ${
              selected ? 'bg-blue-500' : 'border-2 border-border-strong'
            }`}
            style={{ width: '22px', height: '22px' }}
          >
            {selected && (
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
        </div>
        <h3 className="text-[17px] font-semibold mb-2 line-clamp-2 text-text-primary leading-snug">
          {chart.title || 'Untitled'}
        </h3>
        {chart.subtitle && (
          <p className="text-[15px] mb-4 line-clamp-2 text-text-secondary leading-relaxed">
            {chart.subtitle}
          </p>
        )}
      </div>
    )
  }

  return (
    <Link
      to={`/chart/${chart.id}`}
      className="bg-surface-raised rounded-2xl border border-border-default shadow-card hover:shadow-card-hover flex flex-col transition-all hover:-translate-y-0.5 cursor-pointer"
      style={{ padding: '28px 32px', textDecoration: 'none' }}
    >
      {/* Type badge + date */}
      <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
        <span
          className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full font-medium"
          style={{ color: meta.fg, backgroundColor: meta.bg }}
        >
          <Icon />
          {meta.label}
        </span>
        <span className="text-[13px] text-text-muted">{date}</span>
      </div>

      {/* Title */}
      <h3 className="text-[17px] font-semibold mb-2 line-clamp-2 text-text-primary leading-snug">
        {chart.title || 'Untitled'}
      </h3>

      {/* Subtitle */}
      {chart.subtitle && (
        <p className="text-[15px] mb-4 line-clamp-2 text-text-secondary leading-relaxed">
          {chart.subtitle}
        </p>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-3" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border-subtle)' }}>
        <Link
          to={`/editor/${chart.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium"
        >
          Edit
        </Link>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDuplicate() }}
          disabled={duplicating}
          className="text-[13px] px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium disabled:opacity-50"
        >
          {duplicating ? 'Duplicating...' : 'Duplicate'}
        </button>
        <div className="flex-1" />
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-red-400 font-medium">Delete?</span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmDelete() }}
              disabled={deleting}
              className="text-[13px] px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Yes'}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelDelete() }}
              className="text-[13px] px-3 py-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary transition-colors font-medium"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDelete() }}
            className="text-[13px] px-4 py-2 rounded-lg text-red-400 hover:text-red-300 transition-colors font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </Link>
  )
}
