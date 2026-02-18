import { useEditorStore } from '../../stores/editorStore'
import type { ReferenceLine, PointAnnotation, HighlightRange, Annotations } from '../../types/chart'
import {
  getDefaultX, getYForX, getXValues, formatXValue,
  defaultReferenceLineValue, defaultHighlightRange,
  isTemporalType, smartOffset, resolveOffset,
  type AnnotationDataContext,
} from '../../utils/annotationDefaults'

function genId() {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Build context object for annotation default helpers. */
function useAnnotationContext(): AnnotationDataContext {
  const data = useEditorStore((s) => s.data)
  const config = useEditorStore((s) => s.config)
  const columnTypes = useEditorStore((s) => s.columnTypes)
  // Multi-Y charts UNPIVOT into metric_name/metric_value columns
  const isMultiY = Array.isArray(config.y) && config.y.length > 1
  const yColumn = isMultiY ? 'metric_value' : (Array.isArray(config.y) ? config.y[0] : config.y) ?? undefined
  return { data, xColumn: config.x ?? undefined, yColumn, columnTypes }
}

export function AnnotationEditor() {
  const annotations = useEditorStore((s) => s.config.annotations)
  const updateConfig = useEditorStore((s) => s.updateConfig)
  const ctx = useAnnotationContext()

  const update = (next: Annotations) => updateConfig({ annotations: next })

  // ── Reference Lines ──────────────────────────────────────────────────────

  const addLine = () => {
    const axis: 'x' | 'y' = 'y'
    const value = defaultReferenceLineValue(ctx, axis)
    update({
      ...annotations,
      lines: [...annotations.lines, { id: genId(), axis, value, label: '', color: '#e45756' }],
    })
  }

  const updateLine = (id: string, patch: Partial<ReferenceLine>) => {
    // When axis changes, recompute default value from data
    if (patch.axis) {
      const current = annotations.lines.find((l) => l.id === id)
      if (current) {
        patch.value = defaultReferenceLineValue(ctx, patch.axis)
      }
    }
    update({
      ...annotations,
      lines: annotations.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })
  }

  const removeLine = (id: string) => {
    update({ ...annotations, lines: annotations.lines.filter((l) => l.id !== id) })
  }

  // ── Point Notes ────────────────────────────────────────────────────────────

  const addPointNote = () => {
    const defaultX = getDefaultX(ctx)
    const yCol = ctx.yColumn
    const xCol = ctx.xColumn
    const defaultY = (xCol && yCol) ? getYForX(ctx.data, xCol, yCol, defaultX) ?? 0 : 0
    const offset = smartOffset(ctx, defaultX, defaultY)
    update({
      ...annotations,
      texts: [...annotations.texts, {
        id: genId(),
        x: defaultX as number | string,
        y: defaultY,
        text: 'Note',
        ...offset,
        color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim() || '#e2e8f0',
      }],
    })
  }

  const updatePointNote = (id: string, patch: Partial<PointAnnotation>) => {
    update({
      ...annotations,
      texts: annotations.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  const removePointNote = (id: string) => {
    update({ ...annotations, texts: annotations.texts.filter((t) => t.id !== id) })
  }

  // ── Highlight Ranges ─────────────────────────────────────────────────────

  const addRange = () => {
    const axis: 'x' | 'y' = 'y'
    const { start, end } = defaultHighlightRange(ctx, axis)
    update({
      ...annotations,
      ranges: [...annotations.ranges, { id: genId(), axis, start, end, label: '', color: '#e45756', opacity: 0.1 }],
    })
  }

  const updateRange = (id: string, patch: Partial<HighlightRange>) => {
    // When axis changes, recompute default start/end from data
    if (patch.axis) {
      const range = defaultHighlightRange(ctx, patch.axis)
      patch.start = range.start
      patch.end = range.end
    }
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
        <AddButton label="Point Note" onClick={addPointNote} />
        <AddButton label="Highlight Range" onClick={addRange} />
      </div>

      {totalCount === 0 && (
        <p className="text-xs text-text-muted">No annotations yet. Add one above.</p>
      )}

      {/* Reference Lines */}
      {annotations.lines.map((line) => (
        <LineEditor key={line.id} line={line} ctx={ctx} onChange={updateLine} onRemove={removeLine} />
      ))}

      {/* Point Notes */}
      {annotations.texts.map((note) => (
        <PointNoteEditor key={note.id} ann={note} ctx={ctx} onChange={updatePointNote} onRemove={removePointNote} />
      ))}

      {/* Highlight Ranges */}
      {annotations.ranges.map((range) => (
        <RangeEditor key={range.id} range={range} ctx={ctx} onChange={updateRange} onRemove={removeRange} />
      ))}
    </div>
  )
}

// ── Sub-editors ─────────────────────────────────────────────────────────────

function LineEditor({
  line,
  ctx,
  onChange,
  onRemove,
}: {
  line: ReferenceLine
  ctx: AnnotationDataContext
  onChange: (id: string, patch: Partial<ReferenceLine>) => void
  onRemove: (id: string) => void
}) {
  const xCol = ctx.xColumn
  const xType = xCol ? ctx.columnTypes[xCol] : undefined
  const showXDropdown = line.axis === 'x' && xCol && ctx.data.length > 0
  const xValues = showXDropdown ? getXValues(ctx.data, xCol) : []

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
          {showXDropdown ? (
            <select
              value={String(line.value)}
              onChange={(e) => {
                const raw = e.target.value
                const num = Number(raw)
                onChange(line.id, { value: isNaN(num) ? raw : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            >
              {xValues.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {formatXValue(v, xType)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={line.value}
              onChange={(e) => {
                const num = Number(e.target.value)
                onChange(line.id, { value: isNaN(num) ? e.target.value : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            />
          )}
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

function PointNoteEditor({
  ann,
  ctx,
  onChange,
  onRemove,
}: {
  ann: PointAnnotation
  ctx: AnnotationDataContext
  onChange: (id: string, patch: Partial<PointAnnotation>) => void
  onRemove: (id: string) => void
}) {
  const placingId = useEditorStore((s) => s.placingAnnotationId)
  const setPlacing = useEditorStore((s) => s.setPlacingAnnotation)
  const isPlacing = placingId === ann.id

  const xCol = ctx.xColumn
  const yCol = ctx.yColumn
  const xType = xCol ? ctx.columnTypes[xCol] : undefined
  const hasData = xCol && ctx.data.length > 0
  const xValues = hasData ? getXValues(ctx.data, xCol) : []
  const isTemporal = isTemporalType(xType)

  const handleXChange = (newX: number | string) => {
    const patch: Partial<PointAnnotation> = { x: newX }
    // Auto-fill y from data when x changes
    if (xCol && yCol) {
      const autoY = getYForX(ctx.data, xCol, yCol, newX)
      if (autoY !== undefined) patch.y = autoY
    }
    onChange(ann.id, patch)
  }

  const togglePlacement = () => {
    setPlacing(isPlacing ? null : ann.id)
  }

  return (
    <AnnotationCard label="Point Note" color={ann.color ?? '#333'} onRemove={() => onRemove(ann.id)}>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <MiniLabel>Label</MiniLabel>
          <input
            type="text"
            value={ann.text}
            onChange={(e) => onChange(ann.id, { text: e.target.value })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <button
          onClick={togglePlacement}
          title={isPlacing ? 'Cancel placement' : 'Pick from chart'}
          className={`shrink-0 px-2 py-1 text-xs rounded border transition-colors ${
            isPlacing
              ? 'bg-blue-500 text-white border-blue-500'
              : 'border-border-default text-text-secondary hover:bg-surface-secondary hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      </div>
      {isPlacing && (
        <p className="text-[10px] text-blue-500 mt-1">Click on the chart to place this note</p>
      )}
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <div>
          <MiniLabel>X Value</MiniLabel>
          {hasData ? (
            <select
              value={String(ann.x)}
              onChange={(e) => {
                const raw = e.target.value
                // Keep as string for dates, parse for numbers
                const num = Number(raw)
                handleXChange(isTemporal || isNaN(num) ? raw : num)
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            >
              {xValues.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {formatXValue(v, xType)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={ann.x}
              onChange={(e) => {
                const num = Number(e.target.value)
                handleXChange(isNaN(num) ? e.target.value : num)
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            />
          )}
        </div>
        <div>
          <MiniLabel>Y Value</MiniLabel>
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
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-1.5 items-end">
        <div>
          <MiniLabel>Offset X</MiniLabel>
          <input
            type="number"
            value={resolveOffset(ann).dx}
            onChange={(e) => onChange(ann.id, { dx: Number(e.target.value), dy: resolveOffset(ann).dy, position: undefined })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <div>
          <MiniLabel>Offset Y</MiniLabel>
          <input
            type="number"
            value={resolveOffset(ann).dy}
            onChange={(e) => onChange(ann.id, { dy: Number(e.target.value), dx: resolveOffset(ann).dx, position: undefined })}
            className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
          />
        </div>
        <button
          title="Auto-position"
          onClick={() => {
            const yNum = typeof ann.y === 'number' ? ann.y : Number(ann.y) || 0
            const offset = smartOffset(ctx, ann.x, yNum)
            onChange(ann.id, { ...offset, position: undefined })
          }}
          className="px-2 py-1 text-xs rounded border border-border-default text-text-secondary hover:bg-surface-secondary hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          Auto
        </button>
      </div>
      <p className="text-[10px] text-text-muted mt-1">Drag label on chart to reposition</p>
      <div className="mt-1.5">
        <MiniLabel>Color</MiniLabel>
        <ColorPicker value={ann.color ?? '#333'} onChange={(color) => onChange(ann.id, { color })} />
      </div>
    </AnnotationCard>
  )
}

function RangeEditor({
  range,
  ctx,
  onChange,
  onRemove,
}: {
  range: HighlightRange
  ctx: AnnotationDataContext
  onChange: (id: string, patch: Partial<HighlightRange>) => void
  onRemove: (id: string) => void
}) {
  const xCol = ctx.xColumn
  const xType = xCol ? ctx.columnTypes[xCol] : undefined
  const showXDropdown = range.axis === 'x' && xCol && ctx.data.length > 0
  const xValues = showXDropdown ? getXValues(ctx.data, xCol) : []

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
          {showXDropdown ? (
            <select
              value={String(range.start)}
              onChange={(e) => {
                const raw = e.target.value
                const num = Number(raw)
                onChange(range.id, { start: isNaN(num) ? raw : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            >
              {xValues.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {formatXValue(v, xType)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={range.start}
              onChange={(e) => {
                const num = Number(e.target.value)
                onChange(range.id, { start: isNaN(num) ? e.target.value : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            />
          )}
        </div>
        <div>
          <MiniLabel>End</MiniLabel>
          {showXDropdown ? (
            <select
              value={String(range.end)}
              onChange={(e) => {
                const raw = e.target.value
                const num = Number(raw)
                onChange(range.id, { end: isNaN(num) ? raw : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            >
              {xValues.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {formatXValue(v, xType)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={range.end}
              onChange={(e) => {
                const num = Number(e.target.value)
                onChange(range.id, { end: isNaN(num) ? e.target.value : num })
              }}
              className="w-full px-1.5 py-1 text-xs border border-border-default rounded bg-surface text-text-primary"
            />
          )}
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
      <p className="text-[10px] text-text-muted mt-1">Drag edges on chart to resize</p>
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

const SWATCH_COLORS = [
  '#e45756', // red (default annotation color)
  '#2166ac', // steel blue
  '#e08214', // orange
  '#4dac26', // green
  '#b2abd2', // lavender
  '#d6604d', // muted red
  '#888888', // gray
  '#333333', // dark
]

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SWATCH_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className="w-4 h-4 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: c === value ? 'var(--color-text-primary)' : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-medium text-text-icon mb-0.5">{children}</label>
}
