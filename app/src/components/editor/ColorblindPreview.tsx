import { simulatePalette, CVD_TYPES } from '../../utils/colorblind'
import type { CVDType } from '../../utils/colorblind'
import { useState } from 'react'

interface ColorblindPreviewProps {
  colors: string[]
}

export function ColorblindPreview({ colors }: ColorblindPreviewProps) {
  const [activeType, setActiveType] = useState<CVDType | null>(null)

  const displayColors = activeType ? simulatePalette(colors, activeType) : colors

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Colorblind Preview</p>

      {/* Simulated swatches */}
      <div className="flex gap-0.5">
        {displayColors.slice(0, 8).map((color, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded-sm transition-colors"
            style={{ backgroundColor: color }}
            title={`${colors[i]} → ${color}`}
          />
        ))}
      </div>

      {/* CVD type buttons */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveType(null)}
          className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
            activeType === null
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'border-border-default text-text-muted hover:bg-surface-secondary'
          }`}
        >
          Normal
        </button>
        {CVD_TYPES.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
              activeType === type
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-border-default text-text-muted hover:bg-surface-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
