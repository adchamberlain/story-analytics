/**
 * Heatmap component using Plotly.
 * Shows intensity across two dimensions.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface HeatmapProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function Heatmap({ data, config }: HeatmapProps) {
  const xColumn = config.x
  const yColumn = Array.isArray(config.y) ? config.y[0] : config.y
  const valueColumn = config.value || config.extraProps?.value as string

  if (!xColumn || !yColumn || !valueColumn) {
    return <div className="error-message">Missing x, y, or value column configuration</div>
  }

  // Get unique x and y values
  const xValues = [...new Set(data.map(row => row[xColumn]))]
  const yValues = [...new Set(data.map(row => row[yColumn]))]

  // Create z matrix
  const zMatrix: number[][] = []
  const dataMap = new Map<string, number>()

  // Build lookup map
  for (const row of data) {
    const key = `${row[xColumn]}|${row[yColumn]}`
    dataMap.set(key, Number(row[valueColumn]) || 0)
  }

  // Build z matrix
  for (const y of yValues) {
    const row: number[] = []
    for (const x of xValues) {
      const key = `${x}|${y}`
      row.push(dataMap.get(key) || 0)
    }
    zMatrix.push(row)
  }

  const trace: Data = {
    type: 'heatmap',
    x: xValues as Plotly.Datum[],
    y: yValues as Plotly.Datum[],
    z: zMatrix,
    colorscale: [
      [0, '#eef3ff'],
      [0.25, '#c7d2fe'],
      [0.5, '#a5b4fc'],
      [0.75, '#818cf8'],
      [1, '#7c9eff'],
    ],
    hoverongaps: false,
    showscale: true,
    colorbar: {
      title: { text: valueColumn },
      thickness: 15,
    },
  }

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    xaxis: {
      title: config.xAxisTitle ? { text: config.xAxisTitle } : undefined,
    },
    yaxis: {
      title: config.yAxisTitle ? { text: config.yAxisTitle } : undefined,
    },
  }

  return <PlotlyChart data={[trace]} layout={layout} />
}
