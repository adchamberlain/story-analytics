import { PALETTES } from '../../themes/datawrapper'
import type { PaletteKey } from '../../themes/datawrapper'

interface PaletteSelectorProps {
  value: PaletteKey
  onChange: (palette: PaletteKey) => void
}

const PALETTE_LABELS: Record<PaletteKey, string> = {
  default: 'Default',
  blues: 'Blues',
  reds: 'Reds',
  greens: 'Greens',
}

export function PaletteSelector({ value, onChange }: PaletteSelectorProps) {
  return (
    <div className="space-y-1.5">
      {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`
            w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors border
            ${value === key
              ? 'bg-blue-50 border-blue-300'
              : 'bg-surface border-border-default hover:bg-surface-secondary'
            }
          `}
        >
          <div className="flex gap-0.5">
            {PALETTES[key].map((color, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-text-on-surface">{PALETTE_LABELS[key]}</span>
        </button>
      ))}
    </div>
  )
}
