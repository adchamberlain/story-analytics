/**
 * Charts library page.
 * Grid view of saved charts with search, filter, and preview.
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChartStore } from '../stores/chartStore'
import type { ChartLibraryItem } from '../types/conversation'

const CHART_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'LineChart', label: 'Line' },
  { value: 'BarChart', label: 'Bar' },
  { value: 'AreaChart', label: 'Area' },
  { value: 'BigValue', label: 'KPI' },
  { value: 'DataTable', label: 'Table' },
]

const CHART_ICONS: Record<string, string> = {
  LineChart: '~',
  BarChart: '#',
  AreaChart: '^',
  BigValue: '*',
  DataTable: '=',
  ScatterPlot: '.',
  default: '#',
}

export function ChartsPage() {
  const navigate = useNavigate()
  const {
    charts,
    loading,
    error,
    searchQuery,
    filterType,
    previewChart,
    previewUrl,
    loadCharts,
    deleteChart,
    setSearchQuery,
    setFilterType,
    openPreview,
    closePreview,
  } = useChartStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Load charts on mount
  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch)
        loadCharts(localSearch, filterType)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch, searchQuery, filterType, setSearchQuery, loadCharts])

  const handleFilterChange = useCallback(
    (type: string) => {
      setFilterType(type)
      loadCharts(searchQuery, type)
    },
    [setFilterType, loadCharts, searchQuery]
  )

  const handleDelete = async (chart: ChartLibraryItem) => {
    if (deleteConfirm !== chart.id) {
      setDeleteConfirm(chart.id)
      return
    }
    try {
      await deleteChart(chart.id)
      setDeleteConfirm(null)
    } catch {
      alert('Failed to delete chart')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getChartIcon = (type: string) => CHART_ICONS[type] || CHART_ICONS.default

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
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--color-primary)',
          }}
        >
          Charts
        </h1>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search charts..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--color-gray-800)',
              border: '1px solid var(--color-gray-700)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              fontSize: 'var(--text-sm)',
              width: '200px',
            }}
          />

          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--color-gray-800)',
              border: '1px solid var(--color-gray-700)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            {CHART_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          {/* Build Dashboard */}
          <button
            onClick={() => navigate('/chat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-gray-700)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Build Dashboard
          </button>

          {/* New Chart */}
          <button
            onClick={() => navigate('/charts/new')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + New Chart
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-4)',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-gray-400)',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                border: '2px solid var(--color-gray-700)',
                borderTopColor: 'var(--color-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: 'var(--space-4)',
              }}
            />
            Loading charts...
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-error)',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => loadCharts()}
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-gray-700)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-gray-300)',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        ) : charts.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-gray-400)',
            }}
          >
            <span style={{ fontSize: 'var(--text-lg)' }}>No charts yet.</span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-500)',
                marginTop: 'var(--space-2)',
              }}
            >
              Create your first chart to see it here.
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {charts.map((chart) => (
              <div
                key={chart.id}
                onClick={() => openPreview(chart)}
                style={{
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-gray-700)'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                {/* Card header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--color-warning)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-lg)',
                    }}
                  >
                    {getChartIcon(chart.chart_type)}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-gray-400)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {chart.chart_type}
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    margin: '0 0 var(--space-2) 0',
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    color: 'var(--color-gray-200)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chart.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    margin: '0 0 var(--space-3) 0',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-gray-400)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.4,
                  }}
                >
                  {chart.description || chart.original_request}
                </p>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-gray-500)',
                    }}
                  >
                    {formatDate(chart.created_at)}
                  </span>

                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    {deleteConfirm === chart.id ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(chart)
                          }}
                          style={{
                            padding: 'var(--space-1) var(--space-2)',
                            backgroundColor: 'var(--color-error)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'white',
                            fontSize: 'var(--text-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(null)
                          }}
                          style={{
                            padding: 'var(--space-1) var(--space-2)',
                            backgroundColor: 'var(--color-gray-700)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-gray-300)',
                            fontSize: 'var(--text-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(chart)
                        }}
                        style={{
                          padding: 'var(--space-1) var(--space-2)',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-gray-500)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-gray-500)'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewChart && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-8)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--color-gray-800)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4) var(--space-6)',
                borderBottom: '1px solid var(--color-gray-700)',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--text-xl)',
                  color: 'var(--color-gray-200)',
                }}
              >
                {previewChart.title}
              </h2>
              <button
                onClick={closePreview}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-400)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal body */}
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: '400px',
              }}
            >
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={previewChart.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-gray-400)',
                  }}
                >
                  Loading preview...
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              style={{
                padding: 'var(--space-4) var(--space-6)',
                borderTop: '1px solid var(--color-gray-700)',
                maxHeight: '200px',
                overflow: 'auto',
              }}
            >
              <p
                style={{
                  margin: '0 0 var(--space-3) 0',
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {previewChart.description}
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-900)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-gray-500)',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {previewChart.sql}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
