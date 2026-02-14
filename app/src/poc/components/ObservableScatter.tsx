import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../hooks/useObservablePlot'
import { datawrapperPlotOptions } from '../themes/observableTheme'
import { scatterData } from '../data/sampleData'

export function ObservableScatter() {
  const containerRef = useObservablePlot(
    (width) =>
      Plot.plot({
        ...datawrapperPlotOptions(),
        width,
        height: 320,
        marks: [
          Plot.dot(scatterData, {
            x: 'hours',
            y: 'score',
            fill: 'group',
            r: 4,
          }),
          Plot.tip(scatterData, Plot.pointer({
            x: 'hours',
            y: 'score',
            fill: 'group',
          })),
        ],
      }),
    [scatterData]
  )

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}
