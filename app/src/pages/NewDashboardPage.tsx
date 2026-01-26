/**
 * New Dashboard creation page.
 * Multi-step wizard for composing dashboards from existing charts.
 *
 * Steps:
 * 1. Select Charts - Choose which charts to include
 * 2. Order Charts - Arrange the display order
 * 3. Details - Enter title, LLM generates context block
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChartStore } from '../stores/chartStore'
import { createDashboardFromCharts, generateDashboardContext } from '../api/client'
import type { ChartLibraryItem } from '../types/conversation'

type Step = 'select' | 'order' | 'details'

const CHART_ICONS: Record<string, string> = {
  LineChart: '~',
  BarChart: '#',
  AreaChart: '^',
  BigValue: '*',
  DataTable: '=',
  ScatterPlot: '.',
  default: '#',
}

export function NewDashboardPage() {
  const navigate = useNavigate()
  const { charts, loading, loadCharts } = useChartStore()

  // Wizard state
  const [step, setStep] = useState<Step>('select')
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([])
  const [orderedCharts, setOrderedCharts] = useState<ChartLibraryItem[]>([])

  // Details step state
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [isGeneratingContext, setIsGeneratingContext] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load charts on mount
  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  // When moving to order step, populate orderedCharts from selection
  useEffect(() => {
    if (step === 'order' && selectedChartIds.length > 0) {
      const selected = charts.filter(c => selectedChartIds.includes(c.id))
      // Preserve existing order if charts were already ordered
      if (orderedCharts.length === 0) {
        setOrderedCharts(selected)
      } else {
        // Keep existing order, add new ones at end, remove deselected
        const existingIds = orderedCharts.map(c => c.id)
        const newCharts = selected.filter(c => !existingIds.includes(c.id))
        const keptCharts = orderedCharts.filter(c => selectedChartIds.includes(c.id))
        setOrderedCharts([...keptCharts, ...newCharts])
      }
    }
  }, [step, selectedChartIds, charts])

  const toggleChartSelection = useCallback((chartId: string) => {
    setSelectedChartIds(prev =>
      prev.includes(chartId)
        ? prev.filter(id => id !== chartId)
        : [...prev, chartId]
    )
  }, [])

  const moveChart = useCallback((index: number, direction: 'up' | 'down') => {
    setOrderedCharts(prev => {
      const newOrder = [...prev]
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= newOrder.length) return prev
      ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
      return newOrder
    })
  }, [])

  const handleGenerateContext = async () => {
    if (!title.trim() || orderedCharts.length === 0) return

    setIsGeneratingContext(true)
    setError(null)

    try {
      const result = await generateDashboardContext(
        title.trim(),
        orderedCharts.map(c => ({ title: c.title, description: c.description || c.original_request }))
      )
      setContext(result.context)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate context')
    } finally {
      setIsGeneratingContext(false)
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const chartIds = orderedCharts.map(c => c.id)
      const response = await createDashboardFromCharts(title.trim(), context || null, chartIds)

      if (response.success && response.dashboard?.slug) {
        // Navigate to the in-app dashboard view
        navigate(`/dashboards/view/${response.dashboard.slug}`)
      } else {
        throw new Error(response.error || 'Failed to create dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dashboard')
    } finally {
      setIsCreating(false)
    }
  }

  const getChartIcon = (type: string) => CHART_ICONS[type] || CHART_ICONS.default

  const canProceedToOrder = selectedChartIds.length > 0
  const canProceedToDetails = orderedCharts.length > 0
  const canCreate = title.trim().length > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--color-gray-900)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--color-gray-700)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button
            onClick={() => navigate('/dashboards')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-gray-400)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            &larr; Back
          </button>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--color-primary)',
            }}
          >
            New Dashboard
          </h1>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {(['select', 'order', 'details'] as Step[]).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: step === s ? 'var(--color-primary)' :
                    (i < ['select', 'order', 'details'].indexOf(step) ? 'var(--color-success)' : 'var(--color-gray-700)'),
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </div>
              <span
                style={{
                  marginLeft: 'var(--space-2)',
                  fontSize: 'var(--text-sm)',
                  color: step === s ? 'var(--color-gray-200)' : 'var(--color-gray-500)',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </span>
              {i < 2 && (
                <div
                  style={{
                    width: '40px',
                    height: '2px',
                    backgroundColor: i < ['select', 'order', 'details'].indexOf(step) ? 'var(--color-success)' : 'var(--color-gray-700)',
                    marginLeft: 'var(--space-3)',
                    marginRight: 'var(--space-1)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-6)' }}>
        {/* Step 1: Select Charts */}
        {step === 'select' && (
          <div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ margin: 0, color: 'var(--color-gray-200)', fontSize: 'var(--text-lg)' }}>
                Select Charts
              </h2>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'var(--color-gray-400)', fontSize: 'var(--text-sm)' }}>
                Choose which charts to include in your dashboard. Selected: {selectedChartIds.length}
              </p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-gray-400)' }}>
                Loading charts...
              </div>
            ) : charts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-gray-400)' }}>
                <p>No charts available.</p>
                <button
                  onClick={() => navigate('/charts/new')}
                  style={{
                    marginTop: 'var(--space-4)',
                    padding: 'var(--space-2) var(--space-4)',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Create your first chart
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                {charts.map((chart) => {
                  const isSelected = selectedChartIds.includes(chart.id)
                  return (
                    <div
                      key={chart.id}
                      onClick={() => toggleChartSelection(chart.id)}
                      style={{
                        backgroundColor: 'var(--color-gray-800)',
                        border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-700)'}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-4)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        position: 'relative',
                      }}
                    >
                      {/* Selection indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 'var(--space-2)',
                          right: 'var(--space-2)',
                          width: '24px',
                          height: '24px',
                          borderRadius: 'var(--radius-sm)',
                          border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-500)'}`,
                          backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                            <path d="M2 6l3 3 5-6" />
                          </svg>
                        )}
                      </div>

                      {/* Chart type */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                        <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)' }}>
                          {getChartIcon(chart.chart_type)}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)', textTransform: 'uppercase' }}>
                          {chart.chart_type}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 style={{
                        margin: '0 0 var(--space-2) 0',
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--color-gray-200)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingRight: 'var(--space-8)',
                      }}>
                        {chart.title}
                      </h3>

                      {/* Description */}
                      <p style={{
                        margin: 0,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-gray-400)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {chart.description || chart.original_request}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Order Charts */}
        {step === 'order' && (
          <div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ margin: 0, color: 'var(--color-gray-200)', fontSize: 'var(--text-lg)' }}>
                Order Charts
              </h2>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'var(--color-gray-400)', fontSize: 'var(--text-sm)' }}>
                Arrange the order in which charts will appear on your dashboard.
              </p>
            </div>

            <div style={{ maxWidth: '600px' }}>
              {orderedCharts.map((chart, index) => (
                <div
                  key={chart.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'var(--color-gray-800)',
                    border: '1px solid var(--color-gray-700)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  {/* Position number */}
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-gray-700)',
                    color: 'var(--color-gray-300)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {index + 1}
                  </span>

                  {/* Chart info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>
                        {getChartIcon(chart.chart_type)}
                      </span>
                      <span style={{
                        color: 'var(--color-gray-200)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {chart.title}
                      </span>
                    </div>
                  </div>

                  {/* Move buttons */}
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      onClick={() => moveChart(index, 'up')}
                      disabled={index === 0}
                      style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: 'var(--color-gray-700)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: index === 0 ? 'var(--color-gray-600)' : 'var(--color-gray-300)',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      &uarr;
                    </button>
                    <button
                      onClick={() => moveChart(index, 'down')}
                      disabled={index === orderedCharts.length - 1}
                      style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: 'var(--color-gray-700)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: index === orderedCharts.length - 1 ? 'var(--color-gray-600)' : 'var(--color-gray-300)',
                        cursor: index === orderedCharts.length - 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      &darr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 'details' && (
          <div style={{ maxWidth: '600px' }}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ margin: 0, color: 'var(--color-gray-200)', fontSize: 'var(--text-lg)' }}>
                Dashboard Details
              </h2>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'var(--color-gray-400)', fontSize: 'var(--text-sm)' }}>
                Give your dashboard a name and optionally generate a context summary.
              </p>
            </div>

            {/* Title input */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="dashboard-title"
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-gray-300)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Title <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                id="dashboard-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Dashboard"
                autoFocus
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-base)',
                }}
              />
            </div>

            {/* Context section */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <label
                  htmlFor="dashboard-context"
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    color: 'var(--color-gray-300)',
                  }}
                >
                  Context Block
                </label>
                <button
                  onClick={handleGenerateContext}
                  disabled={isGeneratingContext || !title.trim()}
                  style={{
                    padding: 'var(--space-1) var(--space-3)',
                    backgroundColor: 'var(--color-gray-700)',
                    border: '1px solid var(--color-gray-600)',
                    borderRadius: 'var(--radius-md)',
                    color: isGeneratingContext || !title.trim() ? 'var(--color-gray-500)' : 'var(--color-primary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    cursor: isGeneratingContext || !title.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGeneratingContext ? 'Generating...' : 'Generate with AI'}
                </button>
              </div>
              <textarea
                id="dashboard-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Optional context or description for the dashboard header..."
                rows={4}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-base)',
                  resize: 'vertical',
                  minHeight: '100px',
                }}
              />
              <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>
                This text will appear at the top of your dashboard to provide context.
              </p>
            </div>

            {/* Selected charts summary */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-gray-300)', marginBottom: 'var(--space-2)' }}>
                Charts ({orderedCharts.length})
              </label>
              <div style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-gray-800)',
                border: '1px solid var(--color-gray-700)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '150px',
                overflow: 'auto',
              }}>
                {orderedCharts.map((chart, index) => (
                  <div
                    key={chart.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-1) 0',
                      borderBottom: index < orderedCharts.length - 1 ? '1px solid var(--color-gray-700)' : 'none',
                    }}
                  >
                    <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-xs)', width: '20px' }}>{index + 1}.</span>
                    <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>{getChartIcon(chart.chart_type)}</span>
                    <span style={{ color: 'var(--color-gray-300)', fontSize: 'var(--text-sm)' }}>{chart.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--color-error)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with navigation buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--color-gray-700)',
        }}
      >
        <button
          onClick={() => {
            if (step === 'select') navigate('/dashboards')
            else if (step === 'order') setStep('select')
            else setStep('order')
          }}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--color-gray-700)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-200)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {step === 'select' ? 'Cancel' : 'Back'}
        </button>

        {step === 'select' && (
          <button
            onClick={() => setStep('order')}
            disabled={!canProceedToOrder}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: canProceedToOrder ? 'var(--color-primary)' : 'var(--color-gray-700)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: canProceedToOrder ? 'white' : 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: canProceedToOrder ? 'pointer' : 'not-allowed',
            }}
          >
            Next: Order Charts
          </button>
        )}

        {step === 'order' && (
          <button
            onClick={() => setStep('details')}
            disabled={!canProceedToDetails}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: canProceedToDetails ? 'var(--color-primary)' : 'var(--color-gray-700)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: canProceedToDetails ? 'white' : 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: canProceedToDetails ? 'pointer' : 'not-allowed',
            }}
          >
            Next: Details
          </button>
        )}

        {step === 'details' && (
          <button
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: canCreate && !isCreating ? 'var(--color-primary)' : 'var(--color-gray-700)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: canCreate && !isCreating ? 'white' : 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: canCreate && !isCreating ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            {isCreating ? (
              <>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Creating...
              </>
            ) : (
              'Create Dashboard'
            )}
          </button>
        )}
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
