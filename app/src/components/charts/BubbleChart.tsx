/**
 * Bubble chart component using Plotly.
 * Scatter plot with size dimension for three-variable visualization.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface BubbleChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function BubbleChart({ data, config }: BubbleChartProps) {
  const xColumn = config.x
  const yColumn = Array.isArray(config.y) ? config.y[0] : config.y
  const sizeColumn = config.extraProps?.size as string | undefined
  const seriesColumn = config.series

  if (!xColumn || !yColumn) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  // Get size values and normalize them
  const sizeValues = sizeColumn
    ? data.map(row => Number(row[sizeColumn]) || 0)
    : data.map(() => 20)

  const maxSize = Math.max(...sizeValues)
  const minSize = Math.min(...sizeValues)
  const normalizedSizes = sizeValues.map(v =>
    maxSize === minSize ? 30 : 10 + ((v - minSize) / (maxSize - minSize)) * 50
  )

  const traces: Data[] = []

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const indices = data
        .map((row, i) => (String(row[seriesColumn]) === seriesValue ? i : -1))
        .filter(i => i >= 0)

      traces.push({
        type: 'scatter',
        mode: 'markers',
        name: seriesValue,
        x: indices.map(i => data[i][xColumn]) as Plotly.Datum[],
        y: indices.map(i => data[i][yColumn]) as Plotly.Datum[],
        marker: {
          size: indices.map(i => normalizedSizes[i]),
          opacity: 0.7,
          line: {
            width: 1,
            color: 'white',
          },
        },
        text: sizeColumn
          ? indices.map(i => `${sizeColumn}: ${data[i][sizeColumn]}`)
          : undefined,
        hovertemplate: sizeColumn
          ? `<b>%{text}</b><br>${xColumn}: %{x}<br>${yColumn}: %{y}<extra></extra>`
          : `${xColumn}: %{x}<br>${yColumn}: %{y}<extra></extra>`,
      })
    }
  } else {
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: yColumn,
      x: data.map(row => row[xColumn]) as Plotly.Datum[],
      y: data.map(row => row[yColumn]) as Plotly.Datum[],
      marker: {
        size: normalizedSizes,
        opacity: 0.7,
        color: 'var(--color-brand)',
        line: {
          width: 1,
          color: 'white',
        },
      },
      text: sizeColumn
        ? data.map(row => `${sizeColumn}: ${row[sizeColumn]}`)
        : undefined,
      hovertemplate: sizeColumn
        ? `<b>%{text}</b><br>${xColumn}: %{x}<br>${yColumn}: %{y}<extra></extra>`
        : `${xColumn}: %{x}<br>${yColumn}: %{y}<extra></extra>`,
    })
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
