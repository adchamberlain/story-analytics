import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../utils/authFetch'
import { CHART_THEMES, type ChartTheme } from '../themes/chartThemes'
import { useChartThemeStore } from '../stores/chartThemeStore'
import { FontPicker } from '../components/FontPicker'

// -- Types -------------------------------------------------------------------

interface SavedThemeResponse {
  id: string
  name: string
  description: string
  theme_data: ChartTheme
  created_at: string
  updated_at: string
}

// -- Default new theme (clone of default) ------------------------------------

function makeBlankTheme(): ChartTheme {
  return structuredClone(CHART_THEMES.default)
}

// -- Component ---------------------------------------------------------------

export function ThemeBuilderPage() {
  const { setChartTheme } = useChartThemeStore()

  // Custom themes from API
  const [customThemes, setCustomThemes] = useState<SavedThemeResponse[]>([])
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editing, setEditing] = useState<ChartTheme | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // null = new
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(saveTimer.current)
  }, [])

  // Load custom themes
  const fetchThemes = useCallback(async () => {
    try {
      const res = await authFetch('/api/themes/')
      if (res.ok) setCustomThemes(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchThemes() }, [fetchThemes])

  // Start editing a new theme
  const startNew = () => {
    const blank = makeBlankTheme()
    blank.id = 'custom_new'
    blank.name = 'My Custom Theme'
    blank.description = 'A custom chart theme'
    setEditing(blank)
    setEditingId(null)
    setEditName(blank.name)
    setEditDescription(blank.description)
    setSaveStatus('idle')
  }

  // Start editing an existing custom theme
  const startEdit = (saved: SavedThemeResponse) => {
    setEditing(structuredClone(saved.theme_data))
    setEditingId(saved.id)
    setEditName(saved.name)
    setEditDescription(saved.description)
    setSaveStatus('idle')
  }

  // Clone a built-in theme
  const cloneBuiltin = (theme: ChartTheme) => {
    const cloned = structuredClone(theme)
    cloned.id = 'custom_clone'
    cloned.name = `${theme.name} (Copy)`
    cloned.description = theme.description
    setEditing(cloned)
    setEditingId(null)
    setEditName(cloned.name)
    setEditDescription(cloned.description)
    setSaveStatus('idle')
  }

  // Save theme
  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    setSaveStatus('idle')

    const body = {
      name: editName,
      description: editDescription,
      theme_data: { ...editing, id: editName.toLowerCase().replace(/\s+/g, '_'), name: editName, description: editDescription },
    }

    try {
      const url = editingId ? `/api/themes/${editingId}` : '/api/themes/'
      const method = editingId ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      const saved: SavedThemeResponse = await res.json()
      setEditingId(saved.id)
      await fetchThemes()
      setSaveStatus('success')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Delete a custom theme
  const handleDelete = async (id: string) => {
    await authFetch(`/api/themes/${id}`, { method: 'DELETE' })
    if (editingId === id) {
      setEditing(null)
      setEditingId(null)
    }
    fetchThemes()
  }

  // Apply theme globally
  const applyTheme = (theme: ChartTheme, id: string) => {
    // Register as a runtime theme and apply
    CHART_THEMES[id] = theme
    setChartTheme(id)
  }

  // Export theme as JSON
  const exportTheme = () => {
    if (!editing) return
    const data = JSON.stringify({ name: editName, description: editDescription, theme_data: editing }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editName.toLowerCase().replace(/\s+/g, '-')}-theme.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import theme from JSON
  const importTheme = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (parsed.theme_data) {
          setEditing(parsed.theme_data)
          setEditName(parsed.name || 'Imported Theme')
          setEditDescription(parsed.description || '')
          setEditingId(null)
          setSaveStatus('idle')
        }
      } catch { /* ignore invalid JSON */ }
    }
    input.click()
  }

  // -- Update helpers for nested theme properties
  const updatePaletteColor = (index: number, color: string) => {
    if (!editing) return
    const next = structuredClone(editing)
    next.palette.colors[index] = color
    setEditing(next)
  }

  const updatePrimary = (color: string) => {
    if (!editing) return
    setEditing({ ...editing, palette: { ...editing.palette, primary: color } })
  }

  const updatePlotBg = (value: string) => {
    if (!editing) return
    setEditing({ ...editing, plot: { ...editing.plot, background: value } })
  }

  // -- Styles
  const sectionClass = 'bg-surface-raised rounded-2xl shadow-card border border-border-default p-6'
  const inputClass = 'w-full px-3 py-2 text-[14px] rounded-lg bg-surface-input border border-border-strong text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  const btnPrimary = 'px-4 py-2 text-[14px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50'
  const btnSecondary = 'px-4 py-2 text-[14px] font-medium rounded-lg border border-border-default text-text-secondary hover:bg-surface-input transition-colors'

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-bold text-text-primary tracking-tight">Theme Builder</h1>
          <p className="text-[14px] text-text-muted mt-1">Create, customize, and manage chart themes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={importTheme} className={btnSecondary}>Import JSON</button>
          <button onClick={startNew} className={btnPrimary}>New Theme</button>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-6">
        {/* ── Sidebar: Theme list ──────────────────────────────── */}
        <div className="space-y-4">
          {/* Built-in themes */}
          <div className={sectionClass}>
            <h3 className="text-[13px] font-semibold text-text-muted uppercase tracking-wide mb-3">Built-in Themes</h3>
            <div className="space-y-1.5">
              {Object.values(CHART_THEMES).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex gap-0.5 shrink-0">
                      {t.palette.colors.slice(0, 4).map((c, i) => (
                        <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <span className="text-[13px] text-text-primary font-medium truncate">{t.name}</span>
                  </div>
                  <button
                    onClick={() => cloneBuiltin(t)}
                    className="text-[11px] text-blue-500 hover:text-blue-400 shrink-0"
                    title="Clone this theme"
                  >
                    Clone
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Custom themes */}
          <div className={sectionClass}>
            <h3 className="text-[13px] font-semibold text-text-muted uppercase tracking-wide mb-3">Custom Themes</h3>
            {loading ? (
              <p className="text-[13px] text-text-muted py-2">Loading...</p>
            ) : customThemes.length === 0 ? (
              <p className="text-[13px] text-text-muted py-2">No custom themes yet. Click "New Theme" to create one.</p>
            ) : (
              <div className="space-y-1.5">
                {customThemes.map((ct) => (
                  <div
                    key={ct.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      editingId === ct.id ? 'bg-blue-500/10 border border-blue-300' : 'hover:bg-surface-secondary'
                    }`}
                    onClick={() => startEdit(ct)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex gap-0.5 shrink-0">
                        {(ct.theme_data?.palette?.colors || []).slice(0, 4).map((c: string, i: number) => (
                          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="text-[13px] text-text-primary font-medium truncate">{ct.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); applyTheme(ct.theme_data, `custom_${ct.id}`) }}
                        className="text-[11px] text-emerald-500 hover:text-emerald-400"
                        title="Apply this theme"
                      >
                        Apply
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(ct.id) }}
                        className="text-[11px] text-red-400 hover:text-red-500"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Main area: Editor ────────────────────────────────── */}
        <div>
          {!editing ? (
            <div className={sectionClass + ' flex items-center justify-center min-h-[400px]'}>
              <div className="text-center">
                <p className="text-[16px] text-text-muted mb-3">Select a theme to edit or create a new one.</p>
                <button onClick={startNew} className={btnPrimary}>Create New Theme</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Name & description */}
              <div className={sectionClass}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Theme Name</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Description</label>
                    <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={inputClass} />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button onClick={handleSave} disabled={saving} className={btnPrimary}>
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                  </button>
                  <button onClick={exportTheme} className={btnSecondary}>Export JSON</button>
                  <button onClick={() => { applyTheme(editing, editingId ? `custom_${editingId}` : 'custom_preview') }} className={btnSecondary}>
                    Preview Live
                  </button>
                  {saveStatus === 'success' && <span className="text-[13px] text-emerald-500">Saved!</span>}
                  {saveStatus === 'error' && <span className="text-[13px] text-red-400">Failed</span>}
                </div>
              </div>

              {/* Palette editor */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Palette</h3>
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-[12px] text-text-secondary shrink-0">Primary:</label>
                  <input
                    type="color"
                    value={editing.palette.primary}
                    onChange={(e) => updatePrimary(e.target.value)}
                    className="w-8 h-8 rounded border-none cursor-pointer"
                  />
                  <span className="text-[12px] font-mono text-text-muted">{editing.palette.primary}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {editing.palette.colors.map((color, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => updatePaletteColor(i, e.target.value)}
                        className="w-10 h-10 rounded border-none cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-text-muted">{color}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Typography</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Font Family</label>
                    <FontPicker
                      value={editing.font.family}
                      fontUrl={editing.fontUrl}
                      onChange={(family, fontUrl) => {
                        setEditing({ ...editing, font: { ...editing.font, family }, fontUrl })
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Title Size</label>
                    <input
                      type="number"
                      value={editing.font.title.size}
                      onChange={(e) => {
                        const next = structuredClone(editing)
                        next.font.title.size = Number(e.target.value)
                        setEditing(next)
                      }}
                      className={inputClass}
                      min={10}
                      max={40}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Title Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editing.font.title.color || '#000000'}
                        onChange={(e) => {
                          const next = structuredClone(editing)
                          next.font.title.color = e.target.value
                          setEditing(next)
                        }}
                        className="w-8 h-8 rounded border-none cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-text-muted">{editing.font.title.color || '(CSS var)'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Axis Size</label>
                    <input
                      type="number"
                      value={editing.font.axis.size}
                      onChange={(e) => {
                        const next = structuredClone(editing)
                        next.font.axis.size = Number(e.target.value)
                        setEditing(next)
                      }}
                      className={inputClass}
                      min={8}
                      max={20}
                    />
                  </div>
                </div>
              </div>

              {/* Plot settings */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Plot Settings</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editing.plot.background || '#ffffff'}
                        onChange={(e) => updatePlotBg(e.target.value)}
                        className="w-8 h-8 rounded border-none cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-text-muted">{editing.plot.background || '(CSS var)'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-text-secondary block mb-1">Line Width</label>
                    <input
                      type="number"
                      value={editing.plot.defaultLineWidth}
                      onChange={(e) => {
                        const next = structuredClone(editing)
                        next.plot.defaultLineWidth = Number(e.target.value)
                        setEditing(next)
                      }}
                      className={inputClass}
                      min={1}
                      max={5}
                      step={0.5}
                    />
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-[13px] text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.plot.grid.y}
                        onChange={(e) => {
                          const next = structuredClone(editing)
                          next.plot.grid.y = e.target.checked
                          setEditing(next)
                        }}
                        className="rounded"
                      />
                      Y Grid
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.plot.axes.xLine}
                        onChange={(e) => {
                          const next = structuredClone(editing)
                          next.plot.axes.xLine = e.target.checked
                          setEditing(next)
                        }}
                        className="rounded"
                      />
                      X Axis
                    </label>
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Logo</h3>
                <div className="space-y-4">
                  {/* Upload button / preview */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-medium text-text-secondary block">Upload Logo</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            setEditing({ ...editing, logoUrl: reader.result as string })
                          }
                          reader.readAsDataURL(file)
                          e.target.value = ''
                        }}
                        className="text-[13px] text-text-secondary file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-500"
                      />
                    </div>
                    {editing.logoUrl && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={editing.logoUrl}
                          alt="Logo preview"
                          style={{ width: editing.logoSize ?? 60 }}
                          className="rounded border border-border-default"
                        />
                        <button
                          onClick={() => setEditing({ ...editing, logoUrl: undefined, logoPosition: undefined, logoSize: undefined })}
                          className="text-[11px] text-red-400 hover:text-red-500"
                        >
                          Remove logo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Position & size (only shown when logo is set) */}
                  {editing.logoUrl && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[12px] font-medium text-text-secondary block mb-2">Position</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
                            <label
                              key={pos}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] cursor-pointer border transition-colors ${
                                (editing.logoPosition ?? 'top-left') === pos
                                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                  : 'border-border-default text-text-secondary hover:bg-surface-secondary'
                              }`}
                            >
                              <input
                                type="radio"
                                name="logoPosition"
                                value={pos}
                                checked={(editing.logoPosition ?? 'top-left') === pos}
                                onChange={() => setEditing({ ...editing, logoPosition: pos })}
                                className="sr-only"
                              />
                              {pos.replace('-', ' ')}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-text-secondary block mb-2">
                          Size: {editing.logoSize ?? 60}px
                        </label>
                        <input
                          type="range"
                          min={20}
                          max={120}
                          value={editing.logoSize ?? 60}
                          onChange={(e) => setEditing({ ...editing, logoSize: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom CSS */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Custom CSS</h3>
                <p className="text-[12px] text-text-muted mb-2">
                  CSS overrides scoped to the chart container. Use <code className="text-[11px] bg-surface-inset px-1 rounded">.sa-chart</code> as the root selector.
                </p>
                <textarea
                  value={editing.customCss ?? ''}
                  onChange={(e) => setEditing({ ...editing, customCss: e.target.value || undefined })}
                  placeholder={`.sa-chart .plot-title {\n  letter-spacing: 0.02em;\n}`}
                  rows={6}
                  className="w-full px-3 py-2 text-[13px] font-mono rounded-lg bg-surface-input border border-border-strong text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
                />
              </div>

              {/* Live preview */}
              <div className={sectionClass}>
                <h3 className="text-[14px] font-semibold text-text-primary mb-3">Preview</h3>
                <div
                  className="rounded-lg p-4 border border-border-default"
                  style={{
                    backgroundColor: editing.plot.background || 'var(--color-surface)',
                    fontFamily: editing.font.family,
                  }}
                >
                  <p style={{
                    fontSize: editing.font.title.size,
                    fontWeight: editing.font.title.weight,
                    color: editing.font.title.color || 'var(--color-text-primary)',
                    marginBottom: 4,
                  }}>
                    {editName}
                  </p>
                  <p style={{
                    fontSize: editing.font.subtitle.size,
                    fontWeight: editing.font.subtitle.weight,
                    color: editing.font.subtitle.color || 'var(--color-text-secondary)',
                    marginBottom: 16,
                  }}>
                    {editDescription || 'Subtitle preview text'}
                  </p>
                  {/* Fake bar chart preview */}
                  <div className="flex items-end gap-2 h-[120px]">
                    {editing.palette.colors.slice(0, 6).map((color, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t"
                        style={{
                          backgroundColor: color,
                          height: `${30 + Math.random() * 70}%`,
                        }}
                      />
                    ))}
                  </div>
                  <p style={{
                    fontSize: editing.font.source.size,
                    fontWeight: editing.font.source.weight,
                    color: editing.font.source.color || 'var(--color-text-muted)',
                    marginTop: 8,
                  }}>
                    Source: Example data
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Link to="/settings" className="text-[14px] text-blue-500 hover:text-blue-400">← Back to Settings</Link>
      </div>
    </div>
  )
}
