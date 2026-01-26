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
import { BubbleChart } from './BubbleChart'
import { Histogram } from './Histogram'
import { FunnelChart } from './FunnelChart'
import { Heatmap } from './Heatmap'
import { SankeyDiagram } from './SankeyDiagram'
import { DualTrendChart } from './DualTrendChart'

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
      return <Histogram data={data} config={config} />

    case 'BubbleChart':
      return <BubbleChart data={data} config={config} />

    case 'FunnelChart':
      return <FunnelChart data={data} config={config} />

    case 'Heatmap':
      return <Heatmap data={data} config={config} />

    case 'SankeyDiagram':
      return <SankeyDiagram data={data} config={config} />

    case 'DualTrendChart':
      return <DualTrendChart data={data} config={config} />

    default:
      return (
        <div className="error-message">
          Unknown chart type: {chartType}
        </div>
      )
  }
}
