/**
 * Area chart component using Plotly.
 * Supports stacked areas.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface AreaChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function AreaChart({ data, config }: AreaChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series
  const isStacked = config.stacked

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []
  let stackGroup = 0

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        traces.push({
          type: 'scatter',
          mode: 'lines',
          fill: 'tozeroy',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          x: seriesData.map(row => row[xColumn]) as Plotly.Datum[],
          y: seriesData.map(row => row[yColumn]) as Plotly.Datum[],
          stackgroup: isStacked ? `stack${stackGroup++}` : undefined,
          line: {
            width: 1,
          },
        })
      }
    }
  } else {
    // No series grouping - one trace per y column
    for (const yColumn of yColumns) {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        fill: isStacked ? 'tonexty' : 'tozeroy',
        name: yColumn,
        x: data.map(row => row[xColumn]) as Plotly.Datum[],
        y: data.map(row => row[yColumn]) as Plotly.Datum[],
        stackgroup: isStacked ? 'stack' : undefined,
        line: {
          width: 1,
        },
      })
    }
  }

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    xaxis: {
      title: config.xAxisTitle ? { text: config.xAxisTitle } : undefined,
    },
    yaxis: {
      title: config.yAxisTitle ? { text: config.yAxisTitle } : undefined,
    },
    showlegend: traces.length > 1,
    legend: {
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
    },
  }

  return <PlotlyChart data={traces} layout={layout} />
}
