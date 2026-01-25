/**
 * Histogram component using Plotly.
 * Shows distribution of a single variable.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface HistogramProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function Histogram({ data, config }: HistogramProps) {
  const xColumn = config.x
  const seriesColumn = config.series
  const bins = config.extraProps?.bins as number | undefined

  if (!xColumn) {
    return <div className="error-message">Missing x column configuration</div>
  }

  const traces: Data[] = []

  if (seriesColumn) {
    // Group by series column for overlaid histograms
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      traces.push({
        type: 'histogram',
        name: seriesValue,
        x: seriesData.map(row => row[xColumn]) as Plotly.Datum[],
        opacity: 0.7,
        ...(bins ? { nbinsx: bins } : {}),
      } as Data)
    }
  } else {
    traces.push({
      type: 'histogram',
      name: xColumn,
      x: data.map(row => row[xColumn]) as Plotly.Datum[],
      marker: {
        color: '#7c9eff',
        line: {
          color: 'white',
          width: 1,
        },
      },
      ...(bins ? { nbinsx: bins } : {}),
    } as Data)
  }

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    xaxis: {
      title: config.xAxisTitle ? { text: config.xAxisTitle } : { text: xColumn },
    },
    yaxis: {
      title: config.yAxisTitle ? { text: config.yAxisTitle } : { text: 'Frequency' },
    },
    barmode: seriesColumn ? 'overlay' : undefined,
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
