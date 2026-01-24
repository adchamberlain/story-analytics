/**
 * Bar chart component using Plotly.
 * Supports horizontal, stacked, and grouped bars.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface BarChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function BarChart({ data, config }: BarChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series
  const isHorizontal = config.horizontal
  const isStacked = config.stacked

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        const trace: Data = {
          type: 'bar',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          orientation: isHorizontal ? 'h' : 'v',
        }

        if (isHorizontal) {
          trace.y = seriesData.map(row => row[xColumn]) as Plotly.Datum[]
          trace.x = seriesData.map(row => row[yColumn]) as Plotly.Datum[]
        } else {
          trace.x = seriesData.map(row => row[xColumn]) as Plotly.Datum[]
          trace.y = seriesData.map(row => row[yColumn]) as Plotly.Datum[]
        }

        traces.push(trace)
      }
    }
  } else {
    // No series grouping - one trace per y column
    for (const yColumn of yColumns) {
      const trace: Data = {
        type: 'bar',
        name: yColumn,
        orientation: isHorizontal ? 'h' : 'v',
      }

      if (isHorizontal) {
        trace.y = data.map(row => row[xColumn]) as Plotly.Datum[]
        trace.x = data.map(row => row[yColumn]) as Plotly.Datum[]
      } else {
        trace.x = data.map(row => row[xColumn]) as Plotly.Datum[]
        trace.y = data.map(row => row[yColumn]) as Plotly.Datum[]
      }

      traces.push(trace)
    }
  }

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    barmode: isStacked ? 'stack' : traces.length > 1 ? 'group' : undefined,
    showlegend: traces.length > 1,
    legend: {
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
    },
  }

  if (isHorizontal) {
    layout.yaxis = {
      title: config.xAxisTitle ? { text: config.xAxisTitle } : undefined,
      automargin: true,
    }
    layout.xaxis = {
      title: config.yAxisTitle ? { text: config.yAxisTitle } : undefined,
    }
  } else {
    layout.xaxis = {
      title: config.xAxisTitle ? { text: config.xAxisTitle } : undefined,
    }
    layout.yaxis = {
      title: config.yAxisTitle ? { text: config.yAxisTitle } : undefined,
    }
  }

  return <PlotlyChart data={traces} layout={layout} />
}
