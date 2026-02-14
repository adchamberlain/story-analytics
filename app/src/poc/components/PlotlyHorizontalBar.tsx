import Plot from 'react-plotly.js'
import { datawrapperPlotlyLayout, plotlyConfig } from '../themes/plotlyTheme'
import { countryData } from '../data/sampleData'

export function PlotlyHorizontalBar() {
  const sorted = [...countryData].sort((a, b) => a.lifeExpectancy - b.lifeExpectancy)

  return (
    <Plot
      data={[
        {
          x: sorted.map((d) => d.lifeExpectancy),
          y: sorted.map((d) => d.country),
          type: 'bar' as const,
          orientation: 'h' as const,
          marker: { color: '#2166ac' },
        },
      ]}
      layout={{
        ...datawrapperPlotlyLayout,
        showlegend: false,
        margin: { ...datawrapperPlotlyLayout.margin, l: 100 },
      }}
      config={plotlyConfig}
      useResizeHandler
      style={{ width: '100%', height: 320 }}
    />
  )
}
