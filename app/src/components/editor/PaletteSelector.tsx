import { useState } from 'react'
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

/** The 3 palettes shown by default */
const PRIMARY_KEYS: PaletteKey[] = ['default', 'tableau10', 'vibrant']

function PaletteButton({ paletteKey, swatches, selected, onClick }: {
  paletteKey: PaletteKey
  swatches: readonly string[]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors border
        ${selected
          ? 'bg-blue-50 border-blue-300'
          : 'bg-surface border-border-default hover:bg-surface-secondary'
        }
      `}
    >
      <div className="flex gap-0.5">
        {swatches.slice(0, 8).map((color, i) => (
          <div
            key={i}
            className="w-3.5 h-3.5 rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <span className="text-text-on-surface">{PALETTE_LABELS[paletteKey]}</span>
    </button>
  )
}

export function PaletteSelector({ value, onChange }: PaletteSelectorProps) {
  const themePalette = useChartThemeStore((s) => s.theme.palette.colors)

  // Auto-expand if the selected palette isn't in the primary set
  const selectedInMore = !PRIMARY_KEYS.includes(value)
  const [expanded, setExpanded] = useState(selectedInMore)

  const getSwatches = (key: PaletteKey) => key === 'default' ? themePalette : PALETTES[key]

  // Collapsed: show just the 3 primary palettes
  if (!expanded) {
    const allKeys = PALETTE_CATEGORIES.flatMap((cat) => cat.keys)
    const hiddenCount = allKeys.length - PRIMARY_KEYS.length

    return (
      <div className="space-y-1">
        {PRIMARY_KEYS.map((key) => (
          <PaletteButton
            key={key}
            paletteKey={key}
            swatches={getSwatches(key)}
            selected={value === key}
            onClick={() => onChange(key)}
          />
        ))}
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-xs text-text-muted hover:text-text-secondary py-1.5 transition-colors"
        >
          + {hiddenCount} more palettes
        </button>
      </div>
    )
  }

  // Expanded: show all palettes grouped by category
  return (
    <div className="space-y-3">
      {PALETTE_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">{cat.label}</p>
          <div className="space-y-1">
            {cat.keys.map((key) => (
              <PaletteButton
                key={key}
                paletteKey={key}
                swatches={getSwatches(key)}
                selected={value === key}
                onClick={() => onChange(key)}
              />
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => setExpanded(false)}
        className="w-full text-xs text-text-muted hover:text-text-secondary py-1.5 transition-colors"
      >
        Show less
      </button>
    </div>
  )
}
