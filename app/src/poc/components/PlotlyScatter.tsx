import Plot from 'react-plotly.js'
import { CHART_COLORS, datawrapperPlotlyLayout, plotlyConfig } from '../themes/plotlyTheme'
import { scatterData } from '../data/sampleData'

export function PlotlyScatter() {
  const groups = ['Control', 'Treatment'] as const

  const traces = groups.map((group, i) => {
    const points = scatterData.filter((d) => d.group === group)
    return {
      x: points.map((d) => d.hours),
      y: points.map((d) => d.score),
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: group,
      marker: { color: CHART_COLORS[i], size: 8 },
    }
  })

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
