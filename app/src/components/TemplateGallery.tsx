/**
 * TemplateGallery — Fetches and displays saved chart templates as a searchable
 * grid of cards. Used inside LibraryPage as a modal for "New from Template".
 */

import { useEffect, useState } from 'react'

// ── Template type ────────────────────────────────────────────────────────────

export interface Template {
  id: string
  name: string
  description: string
  chart_type: string
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Chart type metadata (mirrored from LibraryPage for badge styling) ────────

const CHART_TYPE_META: Record<string, { label: string; fg: string; bg: string }> = {
  BarChart:       { label: 'Bar',       fg: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  LineChart:      { label: 'Line',      fg: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  AreaChart:      { label: 'Area',      fg: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  ScatterPlot:    { label: 'Scatter',   fg: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  Histogram:      { label: 'Histogram', fg: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  BigValue:       { label: 'KPI',       fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  DataTable:      { label: 'Table',     fg: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  HeatMap:        { label: 'HeatMap',   fg: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  BoxPlot:        { label: 'BoxPlot',   fg: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  PieChart:       { label: 'Pie',       fg: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  Treemap:        { label: 'Treemap',   fg: '#84cc16', bg: 'rgba(132,204,22,0.12)' },
  ChoroplethMap:  { label: 'Map',       fg: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TemplateGalleryProps {
  onSelect: (template: Template) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/v2/templates/')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load templates: ${res.statusText}`)
        return res.json()
      })
      .then((data: Template[]) => {
        setTemplates(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  const filtered = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      )
    : templates

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: '64px 0' }}>
        <p className="text-[15px] text-text-secondary" data-testid="template-loading">Loading templates...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ padding: '64px 0' }}>
        <p className="text-[15px] text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full text-[14px] border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface-raised text-text-primary placeholder:text-text-muted transition-colors"
          style={{ padding: '10px 14px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center" style={{ padding: '48px 0' }}>
          <p className="text-[15px] text-text-secondary" data-testid="template-empty">
            {search ? 'No templates match your search.' : 'No templates available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {filtered.map((template) => {
            const meta = CHART_TYPE_META[template.chart_type] ?? { label: template.chart_type, fg: '#64748b', bg: 'rgba(100,116,139,0.12)' }

            return (
              <div
                key={template.id}
                className="bg-surface-raised rounded-xl border border-border-default p-5 hover:shadow-card-hover transition-all"
                data-testid="template-card"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full font-medium"
                    style={{ color: meta.fg, backgroundColor: meta.bg }}
                  >
                    {meta.label}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold text-text-primary mb-1">{template.name}</h3>
                <p className="text-[14px] text-text-secondary mb-4 line-clamp-2">{template.description}</p>
                <button
                  onClick={() => onSelect(template)}
                  className="text-[13px] px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                  data-testid="use-template-btn"
                >
                  Use Template
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
