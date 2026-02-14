import * as Plot from '@observablehq/plot'
import { useObservablePlot } from '../hooks/useObservablePlot'
import { datawrapperPlotOptions } from '../themes/observableTheme'
import { economicData, economicSeries } from '../data/sampleData'

// Reshape wide-form economic data into long-form for Observable Plot
const longData = economicData.flatMap((d) =>
  economicSeries.map((s) => ({
    month: new Date(d.month),
    value: d[s.key],
    series: s.label,
  }))
)

export function ObservableLineChart() {
  const containerRef = useObservablePlot(
    (width) =>
      Plot.plot({
        ...datawrapperPlotOptions(),
        width,
        height: 320,
        marks: [
          Plot.lineY(longData, {
            x: 'month',
            y: 'value',
            stroke: 'series',
          }),
          Plot.tip(longData, Plot.pointerX({
            x: 'month',
            y: 'value',
            stroke: 'series',
          })),
        ],
      }),
    [longData]
  )

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}
