import { useState, useCallback } from 'react'
import { ColorblindPreview } from './ColorblindPreview'

interface PaletteBuilderProps {
  colors: string[]
  onChange: (colors: string[]) => void
}

export function PaletteBuilder({ colors, onChange }: PaletteBuilderProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const updateColor = useCallback((index: number, color: string) => {
    const next = [...colors]
    next[index] = color
    onChange(next)
  }, [colors, onChange])

  const addColor = useCallback(() => {
    if (colors.length >= 12) return
    // Generate a new color that contrasts with existing ones
    const newColor = DEFAULT_NEW_COLORS[colors.length % DEFAULT_NEW_COLORS.length]
    onChange([...colors, newColor])
  }, [colors, onChange])

  const removeColor = useCallback((index: number) => {
    if (colors.length <= 2) return
    onChange(colors.filter((_, i) => i !== index))
  }, [colors, onChange])

  const moveColor = useCallback((fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction
    if (toIndex < 0 || toIndex >= colors.length) return
    const next = [...colors]
    const temp = next[fromIndex]
    next[fromIndex] = next[toIndex]
    next[toIndex] = temp
    onChange(next)
  }, [colors, onChange])

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Custom Palette</p>

      {/* Color swatches with controls */}
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color, i) => (
          <div key={i} className="group relative">
            <button
              onClick={() => setEditingIndex(editingIndex === i ? null : i)}
              className="w-8 h-8 rounded-md border-2 border-border-default hover:border-border-strong transition-colors cursor-pointer"
              style={{ backgroundColor: color }}
              title={color}
            />
            {/* Reorder / remove controls */}
            {editingIndex === i && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-surface-raised border border-border-default rounded-md shadow-md z-10 px-1 py-0.5">
                <button
                  onClick={() => moveColor(i, -1)}
                  disabled={i === 0}
                  className="text-[10px] text-text-muted hover:text-text-primary disabled:opacity-30 px-1"
                  title="Move left"
                >
                  ←
                </button>
                <button
                  onClick={() => removeColor(i)}
                  disabled={colors.length <= 2}
                  className="text-[10px] text-red-400 hover:text-red-500 disabled:opacity-30 px-1"
                  title="Remove"
                >
                  ×
                </button>
                <button
                  onClick={() => moveColor(i, 1)}
                  disabled={i === colors.length - 1}
                  className="text-[10px] text-text-muted hover:text-text-primary disabled:opacity-30 px-1"
                  title="Move right"
                >
                  →
                </button>
              </div>
            )}
          </div>
        ))}
        {/* Add button */}
        {colors.length < 12 && (
          <button
            onClick={addColor}
            className="w-8 h-8 rounded-md border-2 border-dashed border-border-default hover:border-blue-400 flex items-center justify-center text-text-muted hover:text-blue-500 transition-colors"
            title="Add color"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Color input for selected swatch */}
      {editingIndex !== null && editingIndex < colors.length && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colors[editingIndex]}
            onChange={(e) => updateColor(editingIndex, e.target.value)}
            className="w-8 h-8 rounded border-none cursor-pointer"
          />
          <input
            type="text"
            value={colors[editingIndex]}
            onChange={(e) => {
              const v = e.target.value
              if (/^#[0-9a-fA-F]{6}$/.test(v)) updateColor(editingIndex, v)
            }}
            className="w-24 px-2 py-1 text-xs font-mono rounded-md bg-surface-input border border-border-default text-text-primary"
            placeholder="#000000"
          />
        </div>
      )}

      {/* Colorblind preview */}
      <ColorblindPreview colors={colors} />
    </div>
  )
}

const DEFAULT_NEW_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac', '#d4a373', '#6d6875',
]
