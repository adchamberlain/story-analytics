import type { ChartType } from '../../types/chart'
import type { ReactNode } from 'react'

const CHART_TYPES: { type: ChartType; label: string; icon: ReactNode }[] = [
  {
    type: 'BarChart',
    label: 'Bar',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="6" width="4" height="15" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
  {
    type: 'LineChart',
    label: 'Line',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <polyline points="3,17 8,11 13,14 21,5" />
      </svg>
    ),
  },
  {
    type: 'AreaChart',
    label: 'Area',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" opacity="0.85">
        <path d="M3,20 L3,17 L8,11 L13,14 L21,5 L21,20 Z" fillOpacity="0.3" />
        <polyline points="3,17 8,11 13,14 21,5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: 'ScatterPlot',
    label: 'Scatter',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <circle cx="6" cy="16" r="2" />
        <circle cx="10" cy="10" r="2" />
        <circle cx="15" cy="13" r="2" />
        <circle cx="18" cy="7" r="2" />
        <circle cx="8" cy="6" r="2" />
      </svg>
    ),
  },
  {
    type: 'Histogram',
    label: 'Histogram',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="2" y="14" width="4" height="7" />
        <rect x="7" y="8" width="4" height="13" />
        <rect x="12" y="4" width="4" height="17" />
        <rect x="17" y="10" width="4" height="11" />
      </svg>
    ),
  },
  {
    type: 'HeatMap',
    label: 'Heatmap',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="2" y="2" width="6" height="6" rx="1" opacity="0.3" />
        <rect x="9" y="2" width="6" height="6" rx="1" opacity="0.7" />
        <rect x="16" y="2" width="6" height="6" rx="1" opacity="1" />
        <rect x="2" y="9" width="6" height="6" rx="1" opacity="0.8" />
        <rect x="9" y="9" width="6" height="6" rx="1" opacity="0.4" />
        <rect x="16" y="9" width="6" height="6" rx="1" opacity="0.6" />
        <rect x="2" y="16" width="6" height="6" rx="1" opacity="0.5" />
        <rect x="9" y="16" width="6" height="6" rx="1" opacity="0.9" />
        <rect x="16" y="16" width="6" height="6" rx="1" opacity="0.2" />
      </svg>
    ),
  },
  {
    type: 'BoxPlot',
    label: 'Box Plot',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <line x1="12" y1="2" x2="12" y2="7" />
        <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.15" />
        <line x1="7" y1="12" x2="17" y2="12" />
        <line x1="12" y1="17" x2="12" y2="22" />
        <line x1="9" y1="2" x2="15" y2="2" />
        <line x1="9" y1="22" x2="15" y2="22" />
      </svg>
    ),
  },
  {
    type: 'PieChart',
    label: 'Pie',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12,2 A10,10 0 0,1 21.5,15 L12,12 Z" opacity="0.8" />
        <path d="M21.5,15 A10,10 0 0,1 5,19.5 L12,12 Z" opacity="0.5" />
        <path d="M5,19.5 A10,10 0 0,1 12,2 L12,12 Z" opacity="0.3" />
      </svg>
    ),
  },
  {
    type: 'BigValue',
    label: 'KPI',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="bold" fontFamily="system-ui">#</text>
      </svg>
    ),
  },
  {
    type: 'Treemap',
    label: 'Treemap',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="2" y="2" width="12" height="12" rx="1" opacity="0.7" />
        <rect x="15" y="2" width="7" height="7" rx="1" opacity="0.5" />
        <rect x="15" y="10" width="7" height="4" rx="1" opacity="0.35" />
        <rect x="2" y="15" width="8" height="7" rx="1" opacity="0.45" />
        <rect x="11" y="15" width="11" height="7" rx="1" opacity="0.6" />
      </svg>
    ),
  },
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
            flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg text-xs transition-colors border
            ${value === type
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-surface border-border-default text-text-on-surface hover:bg-surface-secondary'
            }
          `}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
