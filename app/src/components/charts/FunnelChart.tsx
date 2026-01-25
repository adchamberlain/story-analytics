/**
 * Funnel chart component using Plotly.
 * Shows conversion through stages.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface FunnelChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function FunnelChart({ data, config }: FunnelChartProps) {
  const xColumn = config.x  // Stage names
  const yColumn = Array.isArray(config.y) ? config.y[0] : config.y  // Values

  if (!xColumn || !yColumn) {
    return <div className="error-message">Missing x (stages) or y (values) column configuration</div>
  }

  const trace = {
    type: 'funnel' as const,
    y: data.map(row => row[xColumn]) as Plotly.Datum[],
    x: data.map(row => row[yColumn]) as Plotly.Datum[],
    textinfo: 'value+percent' as const,
    marker: {
      color: [
        '#7c9eff',
        '#93b0ff',
        '#aac2ff',
        '#c1d4ff',
        '#d8e6ff',
        '#eef3ff',
      ],
      line: {
        width: 1,
        color: 'white',
      },
    },
    connector: {
      line: {
        color: '#c7d2fe',
        width: 1,
      },
    },
  } as Data

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    showlegend: false,
    margin: { l: 150, r: 50, t: 50, b: 50 },
  }

  return <PlotlyChart data={[trace]} layout={layout} />
}
