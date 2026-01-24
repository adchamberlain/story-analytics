/**
 * Chart factory component.
 * Creates the appropriate chart component based on chart type.
 */

import type { ChartSpec } from '../../types/chart'
import { LineChart } from './LineChart'
import { BarChart } from './BarChart'
import { AreaChart } from './AreaChart'
import { BigValue } from './BigValue'
import { ScatterPlot } from './ScatterPlot'
import { DataTable } from './DataTable'

interface ChartFactoryProps {
  spec: ChartSpec
  data: Record<string, unknown>[]
  columns?: string[]
}

export function ChartFactory({ spec, data, columns }: ChartFactoryProps) {
  const { chartType, config } = spec

  switch (chartType) {
    case 'LineChart':
      return <LineChart data={data} config={config} />

    case 'BarChart':
      return <BarChart data={data} config={config} />

    case 'AreaChart':
      return <AreaChart data={data} config={config} />

    case 'ScatterPlot':
      return <ScatterPlot data={data} config={config} />

    case 'BigValue':
      return <BigValue data={data} config={config} />

    case 'DataTable':
      return <DataTable data={data} config={config} columns={columns} />

    case 'Histogram':
      // Use bar chart for histogram (Plotly handles binning)
      return <BarChart data={data} config={config} />

    case 'BubbleChart':
      // Bubble chart is scatter with size dimension - use scatter for now
      return <ScatterPlot data={data} config={config} />

    case 'FunnelChart':
    case 'SankeyDiagram':
    case 'Heatmap':
      // These require more specialized implementations
      // Fall back to data table for now
      return (
        <div>
          <div
            style={{
              padding: '1rem',
              background: 'var(--color-gray-100)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              color: 'var(--color-gray-600)',
              fontSize: '0.875rem',
            }}
          >
            {chartType} visualization coming soon. Showing data table:
          </div>
          <DataTable data={data} config={config} columns={columns} />
        </div>
      )

    default:
      return (
        <div className="error-message">
          Unknown chart type: {chartType}
        </div>
      )
  }
}
