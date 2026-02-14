import type { ChartType } from '../../types/chart'

const CHART_TYPES: { type: ChartType; label: string; icon: string }[] = [
  { type: 'BarChart', label: 'Bar', icon: '|||' },
  { type: 'LineChart', label: 'Line', icon: '~' },
  { type: 'AreaChart', label: 'Area', icon: '/' },
  { type: 'ScatterPlot', label: 'Scatter', icon: '::' },
  { type: 'Histogram', label: 'Histogram', icon: '|_|' },
]

interface ChartTypeSelectorProps {
  value: ChartType
  onChange: (type: ChartType) => void
}

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {CHART_TYPES.map(({ type, label, icon }) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`
            flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs transition-colors border
            ${value === type
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }
          `}
        >
          <span className="text-base font-mono leading-none">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
