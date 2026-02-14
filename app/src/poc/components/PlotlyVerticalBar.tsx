import Plot from 'react-plotly.js'
import { datawrapperPlotlyLayout, plotlyConfig } from '../themes/plotlyTheme'
import { countryData } from '../data/sampleData'

export function PlotlyVerticalBar() {
  const sorted = [...countryData].sort((a, b) => b.satisfaction - a.satisfaction)

  return (
    <Plot
      data={[
        {
          x: sorted.map((d) => d.country),
          y: sorted.map((d) => d.satisfaction),
          type: 'bar' as const,
          marker: { color: '#2166ac' },
        },
      ]}
      layout={{
        ...datawrapperPlotlyLayout,
        showlegend: false,
      }}
      config={plotlyConfig}
      useResizeHandler
      style={{ width: '100%', height: 320 }}
    />
  )
}
