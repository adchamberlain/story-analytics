/**
 * DashboardView page - renders a multi-chart dashboard by slug.
 * Fetches dashboard layout and chart data, renders in a grid.
 */

import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import type { DashboardRenderData } from '../types/dashboard'
import { fetchDashboardRenderData } from '../api/client'

export default function DashboardView() {
  const { slug } = useParams<{ slug: string }>()
  const [renderData, setRenderData] = useState<DashboardRenderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return

    const loadDashboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchDashboardRenderData(slug)
        setRenderData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [slug])

  if (loading) {
    return <div className="loading-spinner" />
  }

  if (error) {
    return <div className="error-message">{error}</div>
  }

  if (!renderData) {
    return <div className="error-message">No dashboard data found</div>
  }

  return (
    <div style={{
      padding: '1.5rem',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-gray-900)',
        }}>
          {renderData.dashboard.title}
        </h1>
        {renderData.dashboard.description && (
          <p style={{
            marginTop: '0.5rem',
            color: 'var(--color-gray-600)',
          }}>
            {renderData.dashboard.description}
          </p>
        )}
      </header>

      <DashboardGrid
        charts={renderData.charts}
        layout={renderData.dashboard.layout}
      />
    </div>
  )
}
