import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../hooks/useObservablePlot'
import { datawrapperPlotOptions } from '../themes/observableTheme'
import { countryData } from '../data/sampleData'

export function ObservableVerticalBar() {
  const containerRef = useObservablePlot(
    (width) =>
      Plot.plot({
        ...datawrapperPlotOptions(),
        width,
        height: 320,
        x: {
          line: true,
          tickSize: 0,
          labelOffset: 8,
        },
        marks: [
          Plot.barY(countryData, {
            x: 'country',
            y: 'satisfaction',
            fill: '#2166ac',
            sort: { x: 'y', reverse: true },
          }),
          Plot.tip(countryData, Plot.pointerX({
            x: 'country',
            y: 'satisfaction',
          })),
        ],
      }),
    [countryData]
  )

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}
