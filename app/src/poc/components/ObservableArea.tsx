import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../hooks/useObservablePlot'
import { datawrapperPlotOptions } from '../themes/observableTheme'
import { cpiData } from '../data/sampleData'

// Parse month strings to Date objects
const parsedData = cpiData.map((d) => ({
  ...d,
  month: new Date(d.month),
}))

export function ObservableArea() {
  const containerRef = useObservablePlot(
    (width) =>
      Plot.plot({
        ...datawrapperPlotOptions(),
        width,
        height: 320,
        marks: [
          Plot.areaY(parsedData, {
            x: 'month',
            y: 'cpi',
            fill: 'rgba(33,102,172,0.15)',
          }),
          Plot.lineY(parsedData, {
            x: 'month',
            y: 'cpi',
            stroke: '#2166ac',
          }),
          Plot.tip(parsedData, Plot.pointerX({
            x: 'month',
            y: 'cpi',
          })),
        ],
      }),
    [parsedData]
  )

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}
