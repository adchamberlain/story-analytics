import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { economicData, economicSeries, countryData, scatterData, cpiData } from './data/sampleData'
import type { ChartConfig, ChartType } from '../types/chart'

// ── Reshape economic data to long-form for multi-series line chart ──────────
const economicLongForm = economicData.flatMap((d) =>
  economicSeries.map((s) => ({
    month: d.month,
    value: d[s.key],
    series: s.label,
  }))
)

// ── Chart definitions using ChartConfig ─────────────────────────────────────
interface ChartDemo {
  title: string
  subtitle: string
  source: string
  chartType: ChartType
  data: Record<string, unknown>[]
  config: ChartConfig
}

const charts: ChartDemo[] = [
  {
    title: 'Multi-Series Line Chart',
    subtitle: 'Monthly economic indicators, Jan 2023 – Dec 2024',
    source: 'Sample data (illustrative)',
    chartType: 'LineChart',
    data: economicLongForm,
    config: { x: 'month', y: 'value', series: 'series' },
  },
  {
    title: 'Vertical Bar Chart',
    subtitle: 'Life satisfaction scores by country',
    source: 'World Happiness Report (sample)',
    chartType: 'BarChart',
    data: countryData as unknown as Record<string, unknown>[],
    config: { x: 'country', y: 'satisfaction' },
  },
  {
    title: 'Horizontal Bar Chart',
    subtitle: 'Life expectancy by country, ranked',
    source: 'WHO (sample)',
    chartType: 'BarChart',
    data: countryData as unknown as Record<string, unknown>[],
    config: { x: 'country', y: 'lifeExpectancy', horizontal: true },
  },
  {
    title: 'Grouped Scatter Plot',
    subtitle: 'Study hours vs test score by group',
    source: 'Research study (sample)',
    chartType: 'ScatterPlot',
    data: scatterData as unknown as Record<string, unknown>[],
    config: { x: 'hours', y: 'score', series: 'group' },
  },
  {
    title: 'Area Chart',
    subtitle: 'Consumer Price Index trend, Jan 2023 – Dec 2024',
    source: 'BLS (sample)',
    chartType: 'AreaChart',
    data: cpiData as unknown as Record<string, unknown>[],
    config: { x: 'month', y: 'cpi' },
  },
]

export function PocPage() {
  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
          Observable Plot Chart Factory
        </h1>
        <p className="text-sm mt-1" style={{ color: '#666666' }}>
          All chart types rendered by a single ObservableChartFactory component
        </p>
      </header>

      {/* Charts */}
      <main className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {charts.map((chart) => (
          <ChartWrapper
            key={chart.title}
            title={chart.title}
            subtitle={chart.subtitle}
            source={chart.source}
          >
            <ObservableChartFactory
              data={chart.data}
              config={chart.config}
              chartType={chart.chartType}
            />
          </ChartWrapper>
        ))}
      </main>
    </div>
  )
}
