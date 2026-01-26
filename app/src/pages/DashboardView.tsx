/**
 * DashboardView page - renders a multi-chart dashboard by slug.
 * Fetches dashboard layout and chart data, renders in a grid.
 *
 * Works in two modes:
 * 1. Standalone (/dashboard/:slug) - full page, no navigation
 * 2. In-app (/dashboards/view/:slug) - with sidebar and navigation
 */

import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import type { DashboardRenderData } from '../types/dashboard'
import {
  fetchDashboardRenderData,
  updateDashboardDescription,
  generateDashboardContext,
} from '../api/client'

export default function DashboardView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [renderData, setRenderData] = useState<DashboardRenderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Context editing state
  const [isEditingContext, setIsEditingContext] = useState(false)
  const [editedContext, setEditedContext] = useState('')
  const [isSavingContext, setIsSavingContext] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Check if we're in the app layout (has sidebar) or standalone mode
  const isInApp = location.pathname.startsWith('/dashboards/view/')

  useEffect(() => {
    if (!slug) return

    const loadDashboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchDashboardRenderData(slug)
        setRenderData(data)
        setEditedContext(data.dashboard.description || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [slug])

  const handleStartEdit = () => {
    setEditedContext(renderData?.dashboard.description || '')
    setIsEditingContext(true)
  }

  const handleCancelEdit = () => {
    setEditedContext(renderData?.dashboard.description || '')
    setIsEditingContext(false)
  }

  const handleSaveContext = async () => {
    if (!renderData) return

    setIsSavingContext(true)
    try {
      await updateDashboardDescription(renderData.dashboard.id, editedContext)
      // Update local state
      setRenderData({
        ...renderData,
        dashboard: {
          ...renderData.dashboard,
          description: editedContext,
        },
      })
      setIsEditingContext(false)
    } catch (err) {
      console.error('Failed to save context:', err)
    } finally {
      setIsSavingContext(false)
    }
  }

  const handleRegenerateContext = async () => {
    if (!renderData) return

    setIsRegenerating(true)
    try {
      // Build chart info for context generation
      const chartInfo = renderData.charts.map((c) => ({
        title: c.spec.config?.title || 'Untitled',
        description: c.spec.queryName || '',
      }))

      const result = await generateDashboardContext(
        renderData.dashboard.title,
        chartInfo
      )

      setEditedContext(result.context)
    } catch (err) {
      console.error('Failed to regenerate context:', err)
    } finally {
      setIsRegenerating(false)
    }
  }

  // Handle SQL update - refresh the dashboard data
  const handleSqlUpdate = async () => {
    if (!slug) return

    try {
      const data = await fetchDashboardRenderData(slug)
      setRenderData(data)
    } catch (err) {
      console.error('Failed to refresh dashboard after SQL update:', err)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: isInApp ? 'var(--color-gray-900)' : 'white',
          color: isInApp ? 'var(--color-gray-400)' : 'var(--color-gray-600)',
        }}
      >
        Loading dashboard...
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: isInApp ? 'var(--color-gray-900)' : 'white',
          color: 'var(--color-error)',
          padding: 'var(--space-6)',
        }}
      >
        <p>{error}</p>
        {isInApp && (
          <button
            onClick={() => navigate('/dashboards')}
            style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-gray-700)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              cursor: 'pointer',
            }}
          >
            Back to Dashboards
          </button>
        )}
      </div>
    )
  }

  if (!renderData) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: isInApp ? 'var(--color-gray-900)' : 'white',
          color: isInApp ? 'var(--color-gray-400)' : 'var(--color-gray-600)',
        }}
      >
        No dashboard data found
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: isInApp ? 'var(--color-gray-900)' : 'white',
      }}
    >
      {/* Header - only shown in app mode */}
      {isInApp && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-gray-700)',
            flexShrink: 0,
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
              &larr; Dashboards
            </button>
            <h1
              style={{
                margin: 0,
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: 'var(--color-primary)',
              }}
            >
              {renderData.dashboard.title}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={() => navigate(`/dashboards/new`)}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-gray-700)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-gray-300)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              Edit Charts
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-6)',
        }}
      >
        {/* Dashboard header - different styling for standalone vs in-app */}
        {!isInApp && (
          <header style={{ marginBottom: '1.5rem' }}>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 600,
                color: 'var(--color-gray-900)',
              }}
            >
              {renderData.dashboard.title}
            </h1>
            {renderData.dashboard.description && (
              <p
                style={{
                  marginTop: '0.5rem',
                  color: 'var(--color-gray-600)',
                }}
              >
                {renderData.dashboard.description}
              </p>
            )}
          </header>
        )}

        {/* Context block / description for in-app mode */}
        {isInApp && (
          <div
            style={{
              marginBottom: 'var(--space-6)',
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-gray-800)',
              borderRadius: 'var(--radius-md)',
              borderLeft: '3px solid var(--color-primary)',
            }}
          >
            {isEditingContext ? (
              /* Edit mode */
              <div>
                <textarea
                  value={editedContext}
                  onChange={(e) => setEditedContext(e.target.value)}
                  placeholder="Enter context or description for this dashboard..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-gray-900)',
                    border: '1px solid var(--color-gray-600)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-gray-200)',
                    fontSize: 'var(--text-base)',
                    lineHeight: 1.6,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  <button
                    onClick={handleRegenerateContext}
                    disabled={isRegenerating}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-gray-600)',
                      borderRadius: 'var(--radius-md)',
                      color: isRegenerating ? 'var(--color-gray-500)' : 'var(--color-primary)',
                      fontSize: 'var(--text-sm)',
                      cursor: isRegenerating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isRegenerating ? 'Regenerating...' : 'Regenerate with AI'}
                  </button>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--color-gray-700)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-gray-300)',
                        fontSize: 'var(--text-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveContext}
                      disabled={isSavingContext}
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--color-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: 'white',
                        fontSize: 'var(--text-sm)',
                        cursor: isSavingContext ? 'not-allowed' : 'pointer',
                        opacity: isSavingContext ? 0.7 : 1,
                      }}
                    >
                      {isSavingContext ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* View mode */
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 'var(--space-4)',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--color-gray-200)',
                      fontSize: 'var(--text-base)',
                      lineHeight: 1.7,
                      flex: 1,
                    }}
                  >
                    {renderData.dashboard.description || (
                      <span style={{ color: 'var(--color-gray-500)', fontStyle: 'italic' }}>
                        No context yet. Click Edit to add one.
                      </span>
                    )}
                  </p>
                  <button
                    onClick={handleStartEdit}
                    style={{
                      padding: 'var(--space-1) var(--space-2)',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-gray-600)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-gray-400)',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <DashboardGrid
          charts={renderData.charts}
          layout={renderData.dashboard.layout}
          showCode={isInApp}
          chartIds={renderData.dashboard.chartIds}
          onSqlUpdate={handleSqlUpdate}
        />
      </div>
    </div>
  )
}
