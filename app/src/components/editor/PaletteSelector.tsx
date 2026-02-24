import { PALETTES, PALETTE_CATEGORIES } from '../../themes/plotTheme'
import type { PaletteKey } from '../../themes/plotTheme'
import { useChartThemeStore } from '../../stores/chartThemeStore'

interface PaletteSelectorProps {
  value: PaletteKey
  onChange: (palette: PaletteKey) => void
}

const PALETTE_LABELS: Record<PaletteKey, string> = {
  default: 'Default',
  tableau10: 'Tableau 10',
  colorbrewer_set2: 'Set 2',
  colorbrewer_paired: 'Paired',
  datawrapper: 'Datawrapper',
  vibrant: 'Vibrant',
  blues: 'Blues',
  reds: 'Reds',
  greens: 'Greens',
  purples: 'Purples',
  oranges: 'Oranges',
  warm: 'Warm',
  cool: 'Cool',
  redBlue: 'Red-Blue',
  brownTeal: 'Brown-Teal',
  pinkGreen: 'Pink-Green',
}

export function PaletteSelector({ value, onChange }: PaletteSelectorProps) {
  const themePalette = useChartThemeStore((s) => s.theme.palette.colors)

  return (
    <div className="space-y-3">
      {PALETTE_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">{cat.label}</p>
          <div className="space-y-1">
            {cat.keys.map((key) => {
              const swatches = key === 'default' ? themePalette : PALETTES[key]
              return (
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
                    {(swatches as readonly string[]).slice(0, 8).map((color, i) => (
                      <div
                        key={i}
                        className="w-3.5 h-3.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-text-on-surface">{PALETTE_LABELS[key]}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
