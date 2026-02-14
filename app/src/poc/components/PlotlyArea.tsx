import Plot from 'react-plotly.js'
import { datawrapperPlotlyLayout, plotlyConfig } from '../themes/plotlyTheme'
import { cpiData } from '../data/sampleData'

export function PlotlyArea() {
  return (
    <Plot
      data={[
        {
          x: cpiData.map((d) => d.month),
          y: cpiData.map((d) => d.cpi),
          type: 'scatter' as const,
          mode: 'lines' as const,
          fill: 'tozeroy' as const,
          line: { color: '#2166ac', width: 2 },
          fillcolor: 'rgba(33,102,172,0.15)',
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
