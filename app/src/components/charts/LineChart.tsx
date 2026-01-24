/**
 * Line chart component using Plotly.
 * Converts ChartSpec to Plotly line traces with professional styling.
 */

import { PlotlyChart, defaultLineStyle, createHoverTemplate } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface LineChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function LineChart({ data, config }: LineChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []

  // Determine axis labels for hover template
  const xLabel = config.xAxisTitle || xColumn

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        traces.push({
          type: 'scatter',
          mode: 'lines+markers',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          x: seriesData.map(row => row[xColumn]) as Plotly.Datum[],
          y: seriesData.map(row => row[yColumn]) as Plotly.Datum[],
          ...defaultLineStyle,
          hovertemplate: createHoverTemplate(xLabel, yColumn, {
            showName: seriesValues.length > 1 || yColumns.length > 1,
          }),
        })
      }
    }
  } else {
    // No series grouping - one trace per y column
    for (const yColumn of yColumns) {
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: yColumn,
        x: data.map(row => row[xColumn]) as Plotly.Datum[],
        y: data.map(row => row[yColumn]) as Plotly.Datum[],
        ...defaultLineStyle,
        hovertemplate: createHoverTemplate(xLabel, yColumn, {
          showName: yColumns.length > 1,
        }),
      })
    }
  }

  const layout: Partial<Layout> = {
    title: config.title
      ? {
          text: config.title,
          font: { size: 14, color: '#374151' },
          x: 0.02,
          xanchor: 'left',
        }
      : undefined,
    xaxis: {
      title: config.xAxisTitle
        ? { text: config.xAxisTitle, font: { size: 12 } }
        : undefined,
    },
    yaxis: {
      title: config.yAxisTitle
        ? { text: config.yAxisTitle, font: { size: 12 } }
        : undefined,
    },
    showlegend: traces.length > 1,
    legend: {
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
      font: { size: 11 },
    },
    hovermode: 'x unified',
  }

  return <PlotlyChart data={traces} layout={layout} />
}
