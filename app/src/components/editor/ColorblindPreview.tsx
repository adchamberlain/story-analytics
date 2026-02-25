import { simulatePalette, CVD_TYPES, checkPaletteAccessibility } from '../../utils/colorblind'
import type { CVDType } from '../../utils/colorblind'
import { useState, useMemo } from 'react'

interface ColorblindPreviewProps {
  colors: string[]
}

export function ColorblindPreview({ colors }: ColorblindPreviewProps) {
  const [activeType, setActiveType] = useState<CVDType | null>(null)

  const displayColors = activeType ? simulatePalette(colors, activeType) : colors

  // Check palette accessibility across all CVD types
  const accessibility = useMemo(() => checkPaletteAccessibility(colors), [colors])

  // Get warning for the currently active CVD type
  const activeWarning = activeType
    ? accessibility.warnings.find((w) => w.cvdType === activeType)
    : null

  // Build set of problematic swatch indices for the active CVD type
  const problemIndices = useMemo(() => {
    if (!activeWarning) return new Set<number>()
    const indices = new Set<number>()
    for (const [a, b] of activeWarning.pairs) {
      indices.add(a)
      indices.add(b)
    }
    return indices
  }, [activeWarning])

  // Count warnings per CVD type for badge display
  const warningCountByType = useMemo(() => {
    const map: Partial<Record<CVDType, number>> = {}
    for (const w of accessibility.warnings) {
      map[w.cvdType] = w.pairs.length
    }
    return map
  }, [accessibility.warnings])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Colorblind Preview</p>
        {colors.length >= 2 && (
          accessibility.safe ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              Safe
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {accessibility.warnings.length} warning{accessibility.warnings.length > 1 ? 's' : ''}
            </span>
          )
        )}
      </div>

      {/* Simulated swatches */}
      <div className="flex gap-0.5">
        {displayColors.slice(0, 8).map((color, i) => (
          <div
            key={i}
            className={`w-6 h-6 rounded-sm transition-colors ${
              activeType && problemIndices.has(i) ? 'ring-2 ring-amber-400 ring-offset-1' : ''
            }`}
            style={{ backgroundColor: color }}
            title={`${colors[i]} → ${color}`}
          />
        ))}
      </div>

      {/* Warning message for active CVD type */}
      {activeWarning && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          {activeWarning.message}
        </p>
      )}

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
        {CVD_TYPES.map(({ type, label }) => {
          const warnCount = warningCountByType[type]
          return (
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
              {warnCount != null && (
                <span className="ml-1 text-[9px] font-medium text-amber-600">{warnCount}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
