import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../hooks/useObservablePlot'
import { datawrapperPlotOptions } from '../themes/observableTheme'
import { countryData } from '../data/sampleData'

export function ObservableHorizontalBar() {
  const containerRef = useObservablePlot(
    (width) =>
      Plot.plot({
        ...datawrapperPlotOptions({ marginLeft: 100 }),
        width,
        height: 320,
        marks: [
          Plot.barX(countryData, {
            x: 'lifeExpectancy',
            y: 'country',
            fill: '#2166ac',
            sort: { y: 'x', reverse: true },
          }),
          Plot.tip(countryData, Plot.pointerY({
            x: 'lifeExpectancy',
            y: 'country',
          })),
        ],
      }),
    [countryData]
  )

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}
