/**
 * ChartView page - renders a single chart by ID.
 * Fetches chart data from /api/render/chart/{id} and displays with Plotly.
 */

import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ChartFactory } from '../components/charts/ChartFactory'
import type { ChartRenderData } from '../types/chart'
import { fetchChartRenderData } from '../api/client'

export default function ChartView() {
  const { chartId } = useParams<{ chartId: string }>()
  const [renderData, setRenderData] = useState<ChartRenderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chartId) return

    const loadChart = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchChartRenderData(chartId)
        setRenderData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart')
      } finally {
        setLoading(false)
      }
    }

    loadChart()
  }, [chartId])

  if (loading) {
    return <div className="loading-spinner" />
  }

  if (error) {
    return <div className="error-message">{error}</div>
  }

  if (!renderData) {
    return <div className="error-message">No chart data found</div>
  }

  return (
    <div style={{
      padding: '1rem',
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      {renderData.spec.config?.title && (
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          marginBottom: '1rem',
          color: 'var(--color-gray-900)',
        }}>
          {renderData.spec.config.title}
        </h1>
      )}

      <ChartFactory
        spec={renderData.spec}
        data={renderData.data}
      />
    </div>
  )
}
