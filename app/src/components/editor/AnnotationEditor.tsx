import { useEditorStore } from '../../stores/editorStore'
import type { ReferenceLine, TextAnnotation, HighlightRange, Annotations } from '../../types/chart'

function genId() {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function AnnotationEditor() {
  const annotations = useEditorStore((s) => s.config.annotations)
  const updateConfig = useEditorStore((s) => s.updateConfig)

  const update = (next: Annotations) => updateConfig({ annotations: next })

  // ── Reference Lines ──────────────────────────────────────────────────────

  const addLine = () => {
    update({
      ...annotations,
      lines: [...annotations.lines, { id: genId(), axis: 'y', value: 0, label: '', color: '#e45756' }],
    })
  }

  const updateLine = (id: string, patch: Partial<ReferenceLine>) => {
    update({
      ...annotations,
      lines: annotations.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })
  }

  const removeLine = (id: string) => {
    update({ ...annotations, lines: annotations.lines.filter((l) => l.id !== id) })
  }

  // ── Text Annotations ─────────────────────────────────────────────────────

  const addText = () => {
    update({
      ...annotations,
      texts: [...annotations.texts, { id: genId(), x: 0, y: 0, text: 'Note', color: '#333' }],
    })
  }

  const updateText = (id: string, patch: Partial<TextAnnotation>) => {
    update({
      ...annotations,
      texts: annotations.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  const removeText = (id: string) => {
    update({ ...annotations, texts: annotations.texts.filter((t) => t.id !== id) })
  }

  // ── Highlight Ranges ─────────────────────────────────────────────────────

  const addRange = () => {
    update({
      ...annotations,
      ranges: [...annotations.ranges, { id: genId(), axis: 'y', start: 0, end: 100, label: '', color: '#e45756', opacity: 0.1 }],
    })
  }

  const updateRange = (id: string, patch: Partial<HighlightRange>) => {
    update({
      ...annotations,
      ranges: annotations.ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }

  const removeRange = (id: string) => {
    update({ ...annotations, ranges: annotations.ranges.filter((r) => r.id !== id) })
  }

  const totalCount = annotations.lines.length + annotations.texts.length + annotations.ranges.length

  return (
    <div className="space-y-3">
      {/* Add buttons */}
      <div className="flex flex-wrap gap-1.5">
        <AddButton label="Reference Line" onClick={addLine} />
        <AddButton label="Text Note" onClick={addText} />
        <AddButton label="Highlight Range" onClick={addRange} />
      </div>

      {totalCount === 0 && (
        <p className="text-xs text-text-muted">No annotations yet. Add one above.</p>
      )}

      {/* Reference Lines */}
      {annotations.lines.map((line) => (
        <LineEditor key={line.id} line={line} onChange={updateLine} onRemove={removeLine} />
      ))}

      {/* Text Annotations */}
      {annotations.texts.map((text) => (
        <TextEditor key={text.id} ann={text} onChange={updateText} onRemove={removeText} />
      ))}

      {/* Highlight Ranges */}
      {annotations.ranges.map((range) => (
        <RangeEditor key={range.id} range={range} onChange={updateRange} onRemove={removeRange} />
      ))}
    </div>
  )
}

// ── Sub-editors ─────────────────────────────────────────────────────────────

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: ReferenceLine
  onChange: (id: string, patch: Partial<ReferenceLine>) => void
  onRemove: (id: string) => void
}) {
  return (
    <AnnotationCard label="Reference Line" color={line.color ?? '#e45756'} onRemove={() => onRemove(line.id)}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>Axis</MiniLabel>
          <select
            value={line.axis}
            onChange={(e) => onChange(line.id, { axis: e.target.value as 'x' | 'y' })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          >
            <option value="y">Y (horizontal)</option>
            <option value="x">X (vertical)</option>
          </select>
        </div>
        <div>
          <MiniLabel>Value</MiniLabel>
          <input
            type="text"
            value={line.value}
            onChange={(e) => {
              const num = Number(e.target.value)
              onChange(line.id, { value: isNaN(num) ? e.target.value : num })
            }}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <div>
          <MiniLabel>Label</MiniLabel>
          <input
            type="text"
            value={line.label ?? ''}
            onChange={(e) => onChange(line.id, { label: e.target.value })}
            placeholder="e.g. Target"
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>Color</MiniLabel>
          <ColorPicker value={line.color ?? '#e45756'} onChange={(color) => onChange(line.id, { color })} />
        </div>
      </div>
    </AnnotationCard>
  )
}

function TextEditor({
  ann,
  onChange,
  onRemove,
}: {
  ann: TextAnnotation
  onChange: (id: string, patch: Partial<TextAnnotation>) => void
  onRemove: (id: string) => void
}) {
  return (
    <AnnotationCard label="Text Note" color={ann.color ?? '#333'} onRemove={() => onRemove(ann.id)}>
      <div>
        <MiniLabel>Text</MiniLabel>
        <input
          type="text"
          value={ann.text}
          onChange={(e) => onChange(ann.id, { text: e.target.value })}
          className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1.5">
        <div>
          <MiniLabel>X</MiniLabel>
          <input
            type="text"
            value={ann.x}
            onChange={(e) => {
              const num = Number(e.target.value)
              onChange(ann.id, { x: isNaN(num) ? e.target.value : num })
            }}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>Y</MiniLabel>
          <input
            type="text"
            value={ann.y}
            onChange={(e) => {
              const num = Number(e.target.value)
              onChange(ann.id, { y: isNaN(num) ? e.target.value : num })
            }}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>Color</MiniLabel>
          <ColorPicker value={ann.color ?? '#333'} onChange={(color) => onChange(ann.id, { color })} />
        </div>
      </div>
    </AnnotationCard>
  )
}

function RangeEditor({
  range,
  onChange,
  onRemove,
}: {
  range: HighlightRange
  onChange: (id: string, patch: Partial<HighlightRange>) => void
  onRemove: (id: string) => void
}) {
  return (
    <AnnotationCard label="Highlight Range" color={range.color ?? '#e45756'} onRemove={() => onRemove(range.id)}>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <MiniLabel>Axis</MiniLabel>
          <select
            value={range.axis}
            onChange={(e) => onChange(range.id, { axis: e.target.value as 'x' | 'y' })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          >
            <option value="y">Y (horizontal)</option>
            <option value="x">X (vertical)</option>
          </select>
        </div>
        <div>
          <MiniLabel>Start</MiniLabel>
          <input
            type="text"
            value={range.start}
            onChange={(e) => {
              const num = Number(e.target.value)
              onChange(range.id, { start: isNaN(num) ? e.target.value : num })
            }}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>End</MiniLabel>
          <input
            type="text"
            value={range.end}
            onChange={(e) => {
              const num = Number(e.target.value)
              onChange(range.id, { end: isNaN(num) ? e.target.value : num })
            }}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <div>
          <MiniLabel>Label</MiniLabel>
          <input
            type="text"
            value={range.label ?? ''}
            onChange={(e) => onChange(range.id, { label: e.target.value })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>Color</MiniLabel>
          <ColorPicker value={range.color ?? '#e45756'} onChange={(color) => onChange(range.id, { color })} />
        </div>
      </div>
    </AnnotationCard>
  )
}

// ── Shared primitives ───────────────────────────────────────────────────────

function AnnotationCard({
  label,
  color,
  onRemove,
  children,
}: {
  label: string
  color: string
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-border-default rounded-md p-2.5 bg-surface-secondary">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-semibold text-text-icon uppercase tracking-wider">{label}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-text-muted hover:text-red-500 transition-colors"
          title="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-dashed border-border-strong text-text-secondary hover:bg-surface-secondary hover:border-blue-400 hover:text-blue-600 transition-colors"
    >
      + {label}
    </button>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border border-border-default cursor-pointer"
      />
      <span className="text-[10px] font-mono text-text-muted">{value}</span>
    </div>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-medium text-text-icon mb-0.5">{children}</label>
}
