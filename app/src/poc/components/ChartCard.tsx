interface ChartCardProps {
  title: string
  subtitle?: string
  source?: string
  library: 'Plotly.js' | 'Observable Plot'
  children: React.ReactNode
}

export function ChartCard({ title, subtitle, source, library, children }: ChartCardProps) {
  const badgeColor = library === 'Plotly.js'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: '#1a1a1a' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: '#666666' }}>
              {subtitle}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-3 ${badgeColor}`}>
          {library}
        </span>
      </div>
      <div className="flex-1 min-h-0 mt-3">
        {children}
      </div>
      {source && (
        <p className="text-xs mt-3" style={{ color: '#999999' }}>
          Source: {source}
        </p>
      )}
    </div>
  )
}
