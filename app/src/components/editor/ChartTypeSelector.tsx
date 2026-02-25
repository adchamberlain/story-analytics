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
  {
    type: 'DotPlot',
    label: 'Dot Plot',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <line x1="3" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <circle cx="15" cy="6" r="2.5" />
        <line x1="3" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <circle cx="19" cy="12" r="2.5" />
        <line x1="3" y1="18" x2="11" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <circle cx="11" cy="18" r="2.5" />
      </svg>
    ),
  },
  {
    type: 'RangePlot',
    label: 'Range',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <line x1="6" y1="5" x2="18" y2="5" />
        <circle cx="6" cy="5" r="2" fill="currentColor" />
        <circle cx="18" cy="5" r="2" fill="currentColor" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="4" cy="12" r="2" fill="currentColor" />
        <circle cx="20" cy="12" r="2" fill="currentColor" />
        <line x1="8" y1="19" x2="16" y2="19" />
        <circle cx="8" cy="19" r="2" fill="currentColor" />
        <circle cx="16" cy="19" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'BulletBar',
    label: 'Bullet',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="2" y="3" width="20" height="6" rx="1" opacity="0.15" />
        <rect x="2" y="4" width="14" height="4" rx="1" opacity="0.7" />
        <line x1="17" y1="2" x2="17" y2="10" stroke="currentColor" strokeWidth="2" />
        <rect x="2" y="15" width="20" height="6" rx="1" opacity="0.15" />
        <rect x="2" y="16" width="18" height="4" rx="1" opacity="0.7" />
        <line x1="15" y1="14" x2="15" y2="22" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    type: 'SmallMultiples',
    label: 'Facets',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <rect x="2" y="2" width="9" height="9" rx="1" />
        <polyline points="3,9 5,5 7,7 10,3" />
        <rect x="13" y="2" width="9" height="9" rx="1" />
        <polyline points="14,9 16,4 18,6 21,3" />
        <rect x="2" y="13" width="9" height="9" rx="1" />
        <polyline points="3,20 5,16 7,18 10,14" />
        <rect x="13" y="13" width="9" height="9" rx="1" />
        <polyline points="14,20 16,15 18,17 21,14" />
      </svg>
    ),
  },
  {
    type: 'ChoroplethMap',
    label: 'Map',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3,6 L9,3 L15,6 L21,3 L21,18 L15,21 L9,18 L3,21 Z" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="9" y1="3" x2="9" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="15" y1="6" x2="15" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>
    ),
  },
  {
    type: 'SymbolMap',
    label: 'Symbols',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <circle cx="8" cy="8" r="4" opacity="0.6" />
        <circle cx="16" cy="12" r="3" opacity="0.4" />
        <circle cx="10" cy="17" r="2.5" opacity="0.5" />
        <circle cx="18" cy="6" r="2" opacity="0.3" />
      </svg>
    ),
  },
  {
    type: 'LocatorMap',
    label: 'Locator',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12,2 C8.13,2 5,5.13 5,9 C5,14.25 12,22 12,22 S19,14.25 19,9 C19,5.13 15.87,2 12,2Z" opacity="0.6" />
        <circle cx="12" cy="9" r="2.5" fill="white" />
      </svg>
    ),
  },
  {
    type: 'SpikeMap',
    label: 'Spike',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <line x1="6" y1="20" x2="6" y2="8" />
        <line x1="10" y1="20" x2="10" y2="4" />
        <line x1="14" y1="20" x2="14" y2="12" />
        <line x1="18" y1="20" x2="18" y2="6" />
        <line x1="3" y1="20" x2="21" y2="20" opacity="0.3" />
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
