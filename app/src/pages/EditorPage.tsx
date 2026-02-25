import { useEffect, useCallback, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useEditorStore } from '../stores/editorStore'
import { useDataStore } from '../stores/dataStore'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { Toolbox } from '../components/editor/Toolbox'
import { AIChat } from '../components/editor/AIChat'
import { CommentSidebar } from '../components/comments/CommentSidebar'
import { VersionHistoryPanel } from '../components/editor/VersionHistoryPanel'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig } from '../types/chart'

export function EditorPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const store = useEditorStore()

  const isNew = chartId === 'new'
  const sourceId = searchParams.get('sourceId')
  const templateId = searchParams.get('template')
  const initialSql = (location.state as { initialSql?: string } | null)?.initialSql
  const initialSqlApplied = useRef(false)
  const templateApplied = useRef(false)

  // Load chart or init new on mount; reset store before loading a different chart
  useEffect(() => {
    if (isNew && sourceId) {
      store.reset()
      store.initNew(sourceId)
    } else if (isNew && templateId) {
      // New chart from template — apply template config
      if (!templateApplied.current) {
        templateApplied.current = true
        store.reset()
        fetch(`/api/v2/templates/${templateId}`)
          .then((res) => {
            if (!res.ok) throw new Error('Template not found')
            return res.json()
          })
          .then((tmpl) => {
            const cfg: Partial<ChartConfig> & Record<string, unknown> = tmpl.config ?? {}
            store.updateConfig({
              chartType: (tmpl.chart_type ?? cfg.chartType ?? 'BarChart') as import('../types/chart').ChartType,
              title: (cfg.title as string) ?? tmpl.name ?? '',
              subtitle: (cfg.subtitle as string) ?? '',
              ...(cfg.palette ? { palette: cfg.palette as import('../themes/plotTheme').PaletteKey } : {}),
              ...(cfg.showGrid !== undefined ? { showGrid: cfg.showGrid as boolean } : {}),
              ...(cfg.showLegend !== undefined ? { showLegend: cfg.showLegend as boolean } : {}),
              ...(cfg.showValues !== undefined ? { showValues: cfg.showValues as boolean } : {}),
              ...(cfg.horizontal !== undefined ? { horizontal: cfg.horizontal as boolean } : {}),
              ...(cfg.stacked !== undefined ? { stacked: cfg.stacked as boolean } : {}),
              ...(cfg.xAxisTitle ? { xAxisTitle: cfg.xAxisTitle as string } : {}),
              ...(cfg.yAxisTitle ? { yAxisTitle: cfg.yAxisTitle as string } : {}),
            })
          })
          .catch(() => {
            // Template fetch failed — continue with defaults
          })
      }
    } else if (chartId && chartId !== 'new' && chartId !== store.chartId) {
      store.reset()
      store.loadChart(chartId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, sourceId, templateId])

  // Auto-execute initial SQL passed from DataShaper wizard
  useEffect(() => {
    if (initialSql && !initialSqlApplied.current && isNew && sourceId && !store.loading) {
      initialSqlApplied.current = true
      store.setDataMode('sql')
      store.setCustomSql(initialSql)
      store.executeCustomSql()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSql, store.loading])

  // Dual save paths
  const returnToDashboard = searchParams.get('returnToDashboard')

  const handleSave = useCallback(async () => {
    if (isNew || !store.chartId) {
      const newId = await store.saveNew()
      if (newId) {
        if (returnToDashboard) {
          navigate(`/dashboard/${returnToDashboard}/edit?addChart=${newId}`)
        } else {
          navigate(`/chart/${newId}`)
        }
      }
    } else {
      await store.save()
    }
  }, [isNew, store, navigate, returnToDashboard])

  // Keyboard shortcuts — use getState() to avoid reinstalling on every Zustand update
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useEditorStore.getState().undo()
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useEditorStore.getState().redo()
      } else if (mod && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const [rightTab, setRightTab] = useState<'chat' | 'comments'>('chat')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const handleSaveAsTemplate = useCallback(async () => {
    if (!store.chartId || isNew) return
    setSavingTemplate(true)
    try {
      const res = await fetch(`/api/v2/charts/${store.chartId}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: store.config.title || 'Untitled Template',
          description: `Template from "${store.config.title || 'Untitled'}"`,
        }),
      })
      if (!res.ok) throw new Error('Failed to save template')
    } finally {
      setSavingTemplate(false)
    }
  }, [store.chartId, store.config.title, isNew])

  const isDirty = store.isDirty()

  // Save button enabled logic
  const canSave = (isNew || !store.chartId)
    ? store.config.dataMode === 'sql'
      ? !!store.sql && !store.error  // SQL mode: enabled when query has been run (even with 0 rows)
      : !!store.sql && !store.error  // Table mode: also gate on no error to prevent saving stale data
    : isDirty                        // Existing chart: enabled when dirty

  // Map EditorConfig → ChartConfig for the renderer
  // Multi-Y: backend UNPIVOT produces metric_name/metric_value columns
  const isMultiY = Array.isArray(store.config.y) && store.config.y.length > 1
  const chartConfig: ChartConfig = {
    x: store.config.x ?? undefined,
    y: isMultiY ? 'metric_value' : (Array.isArray(store.config.y) ? store.config.y[0] : store.config.y) ?? undefined,
    series: isMultiY ? 'metric_name' : store.config.series ?? undefined,
    horizontal: store.config.horizontal,
    sort: store.config.sort,
    stacked: store.config.stacked,
    showGrid: store.config.showGrid,
    showLegend: store.config.showLegend,
    showValues: store.config.showValues,
    xAxisTitle: store.config.xAxisTitle || undefined,
    yAxisTitle: store.config.yAxisTitle || undefined,
    annotations: store.config.annotations,
    value: store.config.value ?? undefined,
    comparisonValue: store.config.comparisonValue ?? undefined,
    comparisonLabel: store.config.comparisonLabel || undefined,
    valueFormat: store.config.valueFormat || undefined,
    positiveIsGood: store.config.positiveIsGood,
    metricLabel: store.config.metricLabel ?? undefined,
    tooltipTemplate: store.config.tooltipTemplate || undefined,
    minColumn: store.config.minColumn ?? undefined,
    maxColumn: store.config.maxColumn ?? undefined,
    targetColumn: store.config.targetColumn ?? undefined,
    facetColumn: store.config.facetColumn ?? undefined,
    chartSubtype: store.config.chartSubtype !== 'line' ? store.config.chartSubtype : undefined,
    // Choropleth/map fields
    basemap: store.config.basemap || undefined,
    geoJoinColumn: store.config.geoJoinColumn ?? undefined,
    geoValueColumn: store.config.geoValueColumn ?? undefined,
    geoColorScale: store.config.geoColorScale || undefined,
    geoProjection: store.config.geoProjection || undefined,
    // Point map fields
    geoLatColumn: store.config.geoLatColumn ?? undefined,
    geoLonColumn: store.config.geoLonColumn ?? undefined,
    geoLabelColumn: store.config.geoLabelColumn ?? undefined,
    geoSizeColumn: store.config.geoSizeColumn ?? undefined,
    geoSymbolShape: store.config.geoSymbolShape !== 'circle' ? store.config.geoSymbolShape : undefined,
    geoSizeRange: store.config.geoSizeRange,
  }

  // Apply palette colors
  const paletteColors = PALETTES[store.config.palette] ?? PALETTES.default
  if (store.config.palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  const handleBack = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return
    if (isNew || !store.chartId) {
      useDataStore.getState().reset()
      navigate('/library')
    } else {
      navigate(`/chart/${store.chartId}`)
    }
  }, [isDirty, navigate, isNew, store.chartId])

  if (store.loading) {
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

  if (store.error && !store.data.length && !isNew) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md">
          <p className="text-sm text-red-700 font-medium">Failed to load chart</p>
          <p className="text-sm text-red-600 mt-1">{store.error}</p>
        </div>
      </div>
    )
  }

  const showEmptyState = isNew && store.data.length === 0

  return (
    <div className="h-screen flex flex-col bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default shadow-sm px-5 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-sm text-text-secondary hover:text-text-on-surface transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-base font-semibold text-text-primary">
            {isNew && !store.chartId ? 'New Chart' : store.config.title || 'Untitled Chart'}
          </span>
          {isDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={store.undo}
            disabled={store.configHistory.length === 0}
            className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={store.redo}
            disabled={store.configFuture.length === 0}
            className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          {store.chartId && (
            <button
              onClick={store.discard}
              disabled={!isDirty}
              className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || store.saving}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            title="Save (Ctrl+S)"
          >
            {store.saving ? 'Saving...' : 'Save'}
          </button>
          {store.chartId && !isNew && (
            <>
              <button
                onClick={() => store.saveVersion()}
                className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium"
                title="Save a named version snapshot"
              >
                Save Version
              </button>
              <button
                onClick={() => store.setVersionHistoryOpen(true)}
                className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium"
                title="View version history"
              >
                History
              </button>
            </>
          )}
          {store.chartId && !isNew && (
            <button
              onClick={store.status === 'published' ? store.unpublishChart : store.publishChart}
              className={`px-3 py-2 text-xs rounded-lg border transition-colors font-medium ${
                store.status === 'published'
                  ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400'
                  : 'border-border-default text-text-on-surface hover:bg-surface-secondary'
              }`}
            >
              {store.status === 'published' ? 'Republish' : 'Publish'}
            </button>
          )}
          {store.chartId && !isNew && (
            <button
              onClick={handleSaveAsTemplate}
              disabled={savingTemplate}
              className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium disabled:opacity-50"
              title="Save chart config as a reusable template"
            >
              {savingTemplate ? 'Saving...' : 'Template'}
            </button>
          )}
        </div>
      </header>

      {/* Error banner */}
      {store.error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 shrink-0">
          {store.error}
        </div>
      )}

      {/* Three-pane layout — stacks vertically on mobile */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Left: Toolbox — hidden on mobile, visible on lg+ */}
        <aside className="hidden lg:block w-[280px] border-r border-border-default bg-surface overflow-y-auto shrink-0">
          <Toolbox />
        </aside>

        {/* Center: Chart Preview */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto flex items-start justify-center">
          <div className="w-full max-w-3xl">
            {showEmptyState ? (
              <div className="flex items-center justify-center h-80 border-2 border-dashed border-border-default rounded-xl">
                <div className="text-center">
                  <p className="text-sm text-text-muted">
                    {store.config.dataMode === 'sql'
                      ? 'Write a SQL query and click Run to see your data.'
                      : 'Pick a chart type and map your columns in the toolbox to get started.'}
                  </p>
                </div>
              </div>
            ) : (
              <ChartWrapper
                title={store.config.title || undefined}
                subtitle={store.config.subtitle || undefined}
                source={store.config.source || undefined}
                sourceUrl={store.config.sourceUrl || undefined}
                altText={store.config.altText || undefined}
                chartType={store.config.chartType}
                xColumn={store.config.x || undefined}
                yColumn={Array.isArray(store.config.y) ? store.config.y[0] || undefined : store.config.y || undefined}
                dataLength={store.data.length}
                chartId={store.chartId || undefined}
                allowDataDownload={store.config.allowDataDownload}
              >
                <ObservableChartFactory
                  data={store.data}
                  config={chartConfig}
                  chartType={store.config.chartType}
                  height={420}
                  editable
                />
              </ChartWrapper>
            )}
          </div>
        </main>

        {/* Right: AI Chat / Comments / Version History — hidden on mobile, visible on lg+ */}
        <aside className="hidden lg:flex lg:flex-col w-[320px] border-l border-border-default bg-surface shrink-0">
          {store.versionHistoryOpen ? (
            <VersionHistoryPanel />
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex border-b border-border-default shrink-0">
                <button
                  onClick={() => setRightTab('chat')}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                    rightTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  AI Chat
                </button>
                <button
                  onClick={() => setRightTab('comments')}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                    rightTab === 'comments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  Comments
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {rightTab === 'chat' ? <AIChat /> : <CommentSidebar chartId={store.chartId} />}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
