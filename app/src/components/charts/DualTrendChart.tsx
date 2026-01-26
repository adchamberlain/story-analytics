/**
 * DualTrendChart - Amazon-style WBR (Weekly Business Review) chart.
 *
 * Shows two panels side by side:
 * - Left: Last 6 weeks with year-over-year comparison
 * - Right: Last 12 months with year-over-year comparison
 *
 * This chart helps quickly assess both short-term and long-term trends
 * and compare performance to the same period last year.
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout, Config } from 'plotly.js'
import type { ChartConfig } from '../../types/chart'

interface DualTrendChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

// Chart colors
const CURRENT_YEAR_COLOR = '#6366f1'  // Indigo (solid line)
const PRIOR_YEAR_COLOR = '#a5b4fc'    // Light indigo (dashed line)

export function DualTrendChart({ data, config }: DualTrendChartProps) {
  const metricColumn = config.value || config.y as string || 'metric'
  const dateColumn = config.x || 'date'
  const title = config.title || 'Metric Health Check'
  const metricLabel = config.yAxisTitle || metricColumn
  const valueFormat = config.valueFormat || 'number'

  // Process data into weekly and monthly aggregations with YoY comparison
  const { weeklyData, monthlyData } = useMemo(() => {
    return processDataForDualTrend(data, dateColumn, metricColumn)
  }, [data, dateColumn, metricColumn])

  // Create traces for the weekly panel (left)
  const weeklyTraces: Data[] = useMemo(() => {
    return [
      // Current year - solid line
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'This Year',
        x: weeklyData.current.labels,
        y: weeklyData.current.values,
        xaxis: 'x',
        yaxis: 'y',
        line: {
          color: CURRENT_YEAR_COLOR,
          width: 2.5,
          shape: 'spline',
          smoothing: 0.8,
        },
        marker: {
          size: 8,
          color: CURRENT_YEAR_COLOR,
        },
        hovertemplate: `<b>This Year</b><br>Week %{x}<br>${metricLabel}: %{y:,.0f}<extra></extra>`,
      },
      // Prior year - dashed line
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Last Year',
        x: weeklyData.prior.labels,
        y: weeklyData.prior.values,
        xaxis: 'x',
        yaxis: 'y',
        line: {
          color: PRIOR_YEAR_COLOR,
          width: 2,
          dash: 'dash',
          shape: 'spline',
          smoothing: 0.8,
        },
        marker: {
          size: 6,
          color: PRIOR_YEAR_COLOR,
        },
        hovertemplate: `<b>Last Year</b><br>Week %{x}<br>${metricLabel}: %{y:,.0f}<extra></extra>`,
      },
    ]
  }, [weeklyData, metricLabel])

  // Create traces for the monthly panel (right)
  const monthlyTraces: Data[] = useMemo(() => {
    return [
      // Current year - solid line
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'This Year',
        x: monthlyData.current.labels,
        y: monthlyData.current.values,
        xaxis: 'x2',
        yaxis: 'y2',
        line: {
          color: CURRENT_YEAR_COLOR,
          width: 2.5,
          shape: 'spline',
          smoothing: 0.8,
        },
        marker: {
          size: 8,
          color: CURRENT_YEAR_COLOR,
        },
        showlegend: false,
        hovertemplate: `<b>This Year</b><br>%{x}<br>${metricLabel}: %{y:,.0f}<extra></extra>`,
      },
      // Prior year - dashed line
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Last Year',
        x: monthlyData.prior.labels,
        y: monthlyData.prior.values,
        xaxis: 'x2',
        yaxis: 'y2',
        line: {
          color: PRIOR_YEAR_COLOR,
          width: 2,
          dash: 'dash',
          shape: 'spline',
          smoothing: 0.8,
        },
        marker: {
          size: 6,
          color: PRIOR_YEAR_COLOR,
        },
        showlegend: false,
        hovertemplate: `<b>Last Year</b><br>%{x}<br>${metricLabel}: %{y:,.0f}<extra></extra>`,
      },
    ]
  }, [monthlyData, metricLabel])

  // Combine all traces
  const traces: Data[] = [...weeklyTraces, ...monthlyTraces]

  // Calculate y-axis range to ensure both panels have comparable scales
  const allValues = [
    ...weeklyData.current.values,
    ...weeklyData.prior.values,
    ...monthlyData.current.values,
    ...monthlyData.prior.values,
  ].filter((v): v is number => v !== null && v !== undefined)

  const yMin = Math.min(...allValues) * 0.9
  const yMax = Math.max(...allValues) * 1.1

  // Format y-axis tick values
  const yTickFormat = getYAxisFormat(yMax, valueFormat)

  // Layout with subplots
  const layout: Partial<Layout> = {
    title: {
      text: title,
      font: { size: 16, color: '#374151' },
      x: 0.5,
      xanchor: 'center',
    },
    font: {
      family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      size: 12,
      color: '#374151',
    },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 60, r: 60, t: 60, b: 80 },

    // Grid layout: 2 columns
    grid: {
      rows: 1,
      columns: 2,
      pattern: 'independent',
      xgap: 0.1,
    },

    // Left panel (weekly) - x axis
    xaxis: {
      domain: [0, 0.45],
      title: { text: 'Last 6 Weeks', font: { size: 11, color: '#6b7280' } },
      gridcolor: 'rgba(229, 231, 235, 0.5)',
      linecolor: '#d1d5db',
      tickfont: { size: 10, color: '#6b7280' },
      showgrid: true,
    },
    // Left panel - y axis
    yaxis: {
      range: [yMin, yMax],
      tickformat: yTickFormat,
      gridcolor: 'rgba(229, 231, 235, 0.5)',
      linecolor: '#d1d5db',
      tickfont: { size: 10, color: '#6b7280' },
      showgrid: true,
      title: { text: metricLabel, font: { size: 11, color: '#6b7280' } },
    },

    // Right panel (monthly) - x axis
    xaxis2: {
      domain: [0.55, 1],
      title: { text: 'Last 12 Months', font: { size: 11, color: '#6b7280' } },
      gridcolor: 'rgba(229, 231, 235, 0.5)',
      linecolor: '#d1d5db',
      tickfont: { size: 10, color: '#6b7280' },
      showgrid: true,
      tickangle: -45,
    },
    // Right panel - y axis
    yaxis2: {
      range: [yMin, yMax],
      tickformat: yTickFormat,
      gridcolor: 'rgba(229, 231, 235, 0.5)',
      linecolor: '#d1d5db',
      tickfont: { size: 10, color: '#6b7280' },
      showgrid: true,
      anchor: 'x2',
    },

    // Legend
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0.5,
      xanchor: 'center',
      y: -0.2,
      font: { size: 11, color: '#4b5563' },
      bgcolor: 'transparent',
    },

    // Hover mode
    hovermode: 'closest',
    hoverlabel: {
      bgcolor: '#1f2937',
      bordercolor: 'transparent',
      font: { color: '#f9fafb', size: 12 },
    },

    // Annotations for panel labels
    annotations: [
      {
        text: '<b>Short Term</b>',
        x: 0.225,
        y: 1.08,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 12, color: '#374151' },
      },
      {
        text: '<b>Long Term</b>',
        x: 0.775,
        y: 1.08,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 12, color: '#374151' },
      },
    ],
  }

  const plotConfig: Partial<Config> = {
    responsive: true,
    displayModeBar: 'hover',
    displaylogo: false,
    modeBarButtonsToRemove: [
      'select2d',
      'lasso2d',
      'autoScale2d',
      'toggleSpikelines',
    ],
  }

  return (
    <div className="fade-in">
      <Plot
        data={traces}
        layout={layout}
        config={plotConfig}
        style={{ width: '100%', height: '450px' }}
        useResizeHandler
      />
    </div>
  )
}

/**
 * Process raw data into weekly and monthly aggregations with YoY comparison.
 */
function processDataForDualTrend(
  data: Record<string, unknown>[],
  dateColumn: string,
  metricColumn: string
): {
  weeklyData: { current: { labels: string[]; values: number[] }; prior: { labels: string[]; values: number[] } }
  monthlyData: { current: { labels: string[]; values: number[] }; prior: { labels: string[]; values: number[] } }
} {
  // Sort data by date
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(a[dateColumn] as string)
    const dateB = new Date(b[dateColumn] as string)
    return dateA.getTime() - dateB.getTime()
  })

  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  // Weekly aggregation - last 6 weeks
  const weeklyBuckets = new Map<string, { current: number; prior: number; count: { current: number; prior: number } }>()

  for (let i = 0; i < 6; i++) {
    const weekLabel = `W${6 - i}`
    weeklyBuckets.set(weekLabel, { current: 0, prior: 0, count: { current: 0, prior: 0 } })
  }

  // Monthly aggregation - last 12 months
  const monthlyBuckets = new Map<string, { current: number; prior: number; count: { current: number; prior: number } }>()

  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(now)
    monthDate.setMonth(monthDate.getMonth() - (11 - i))
    const monthLabel = monthDate.toLocaleString('default', { month: 'short' })
    monthlyBuckets.set(monthLabel, { current: 0, prior: 0, count: { current: 0, prior: 0 } })
  }

  // Process each data point
  for (const row of sortedData) {
    const dateValue = row[dateColumn]
    const metricValue = row[metricColumn]

    if (!dateValue || metricValue === null || metricValue === undefined) continue

    const date = new Date(dateValue as string)
    const value = typeof metricValue === 'number' ? metricValue : parseFloat(metricValue as string)
    if (isNaN(value)) continue

    // Determine if this is current year or prior year data
    const isCurrentYear = date >= oneYearAgo

    // Weekly bucket (last 6 weeks for current, same 6 weeks last year for prior)
    const weeksDiff = Math.floor((now.getTime() - date.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const priorYearWeeksDiff = weeksDiff - 52 // Approximate weeks in a year

    if (weeksDiff >= 0 && weeksDiff < 6) {
      const weekLabel = `W${6 - weeksDiff}`
      const bucket = weeklyBuckets.get(weekLabel)
      if (bucket) {
        bucket.current += value
        bucket.count.current += 1
      }
    } else if (priorYearWeeksDiff >= 0 && priorYearWeeksDiff < 6) {
      const weekLabel = `W${6 - priorYearWeeksDiff}`
      const bucket = weeklyBuckets.get(weekLabel)
      if (bucket) {
        bucket.prior += value
        bucket.count.prior += 1
      }
    }

    // Monthly bucket
    const monthLabel = date.toLocaleString('default', { month: 'short' })
    const bucket = monthlyBuckets.get(monthLabel)
    if (bucket) {
      if (isCurrentYear) {
        bucket.current += value
        bucket.count.current += 1
      } else {
        bucket.prior += value
        bucket.count.prior += 1
      }
    }
  }

  // Convert to arrays
  const weeklyLabels = Array.from(weeklyBuckets.keys())
  const weeklyCurrentValues = weeklyLabels.map(label => {
    const bucket = weeklyBuckets.get(label)!
    return bucket.count.current > 0 ? bucket.current : 0
  })
  const weeklyPriorValues = weeklyLabels.map(label => {
    const bucket = weeklyBuckets.get(label)!
    return bucket.count.prior > 0 ? bucket.prior : 0
  })

  const monthlyLabels = Array.from(monthlyBuckets.keys())
  const monthlyCurrentValues = monthlyLabels.map(label => {
    const bucket = monthlyBuckets.get(label)!
    return bucket.count.current > 0 ? bucket.current : 0
  })
  const monthlyPriorValues = monthlyLabels.map(label => {
    const bucket = monthlyBuckets.get(label)!
    return bucket.count.prior > 0 ? bucket.prior : 0
  })

  return {
    weeklyData: {
      current: { labels: weeklyLabels, values: weeklyCurrentValues },
      prior: { labels: weeklyLabels, values: weeklyPriorValues },
    },
    monthlyData: {
      current: { labels: monthlyLabels, values: monthlyCurrentValues },
      prior: { labels: monthlyLabels, values: monthlyPriorValues },
    },
  }
}

/**
 * Get appropriate y-axis format based on value magnitude and format type.
 */
function getYAxisFormat(maxValue: number, valueFormat: string): string {
  if (valueFormat === 'percent') {
    return '.1%'
  }

  if (valueFormat === 'currency') {
    if (maxValue >= 1000000) return '$,.2s'
    if (maxValue >= 1000) return '$,.0f'
    return '$,.2f'
  }

  // Default number format
  if (maxValue >= 1000000) return ',.2s'
  if (maxValue >= 1000) return ',.0f'
  return ',.2f'
}
