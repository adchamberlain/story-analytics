import Plot from 'react-plotly.js'
import { CHART_COLORS, datawrapperPlotlyLayout, plotlyConfig } from '../themes/plotlyTheme'
import { economicData, economicSeries } from '../data/sampleData'

export function PlotlyLineChart() {
  const months = economicData.map((d) => d.month)

  const traces = economicSeries.map((series, i) => ({
    x: months,
    y: economicData.map((d) => d[series.key]),
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: series.label,
    line: { color: CHART_COLORS[i], width: 2 },
  }))

  return (
    <Plot
      data={traces}
      layout={{ ...datawrapperPlotlyLayout }}
      config={plotlyConfig}
      useResizeHandler
      style={{ width: '100%', height: 320 }}
    />
  )
}
