import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChartThemeStore } from '../stores/chartThemeStore'
import { CHART_THEMES } from '../themes/chartThemes'

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', sublabel: 'Claude', keyField: 'anthropic_api_key' as const },
  { id: 'openai', label: 'OpenAI', sublabel: 'GPT', keyField: 'openai_api_key' as const },
  { id: 'google', label: 'Google', sublabel: 'Gemini', keyField: 'google_api_key' as const },
]

interface Settings {
  ai_provider: string
  anthropic_api_key: string
  openai_api_key: string
  google_api_key: string
}

interface DataSource {
  source_id: string
  name: string
  type: string
  row_count: number
  column_count: number
}

export function SettingsPage() {
  const navigate = useNavigate()

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Data sources state
  const [sources, setSources] = useState<DataSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)

  // Load settings on mount
  useEffect(() => {
    fetch('/api/settings/')
      .then((res) => {
        if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: Settings) => {
        setSettings(data)
        setSelectedProvider(data.ai_provider)
        // Show masked key for currently selected provider
        const provider = PROVIDERS.find((p) => p.id === data.ai_provider)
        if (provider) {
          setApiKey(data[provider.keyField])
        }
      })
      .catch(() => {})
  }, [])

  // Load data sources on mount
  useEffect(() => {
    fetch('/api/settings/sources')
      .then((res) => {
        if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: DataSource[]) => {
        setSources(data)
        setSourcesLoading(false)
      })
      .catch(() => setSourcesLoading(false))
  }, [])

  // When provider changes, update the key field display
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId)
    setSaveStatus('idle')
    // Show masked key for this provider if we have settings loaded
    if (settings) {
      const provider = PROVIDERS.find((p) => p.id === providerId)
      if (provider) {
        setApiKey(settings[provider.keyField])
      }
    }
    setShowKey(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')

    const provider = PROVIDERS.find((p) => p.id === selectedProvider)
    if (!provider) return

    const body: Record<string, string> = { ai_provider: selectedProvider }
    // Only send key if it's not a masked value (i.e., user typed a new one)
    if (apiKey && !apiKey.includes('****')) {
      body[provider.keyField] = apiKey
    }

    try {
      const res = await fetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      const data: Settings = await res.json()
      setSettings(data)
      setApiKey(data[provider.keyField])
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const activeProvider = PROVIDERS.find((p) => p.id === selectedProvider)

  const inputClass =
    'w-full px-4 py-3.5 text-[15px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all'

  const TYPE_BADGES: Record<string, string> = {
    csv: 'bg-emerald-500/15 text-emerald-500',
    snowflake: 'bg-sky-500/15 text-sky-400',
    postgres: 'bg-blue-500/15 text-blue-400',
    bigquery: 'bg-amber-500/15 text-amber-500',
  }

  return (
    <div className="px-12 py-12 max-w-[900px]">
      <h1 className="text-[28px] font-bold text-text-primary tracking-tight mb-10">Settings</h1>

      <div className="flex flex-col gap-8">
        {/* ── AI Provider ──────────────────────────────────────────── */}
        <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
          <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">AI Provider</h2>
          <p className="text-[14px] text-text-muted mb-5">Choose your LLM provider and enter an API key.</p>

          {/* Provider grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderSelect(p.id)}
                className={`flex flex-col items-center gap-1 py-4 px-3 rounded-xl border-2 transition-all text-center cursor-pointer ${
                  selectedProvider === p.id
                    ? 'border-blue-500 bg-blue-500/10 text-text-primary'
                    : 'border-border-default bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                <span className="text-[15px] font-semibold">{p.label}</span>
                <span className="text-[13px] text-text-muted">{p.sublabel}</span>
              </button>
            ))}
          </div>

          {/* API key input */}
          {activeProvider && (
            <div>
              <label className="text-sm font-medium text-text-secondary block mb-2.5">
                {activeProvider.label} API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setSaveStatus('idle') }}
                  placeholder={`Enter your ${activeProvider.label} API key`}
                  className={inputClass + ' pr-20'}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-muted hover:text-text-secondary transition-colors px-2 py-1"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Save button + status */}
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving || !selectedProvider}
              className="px-6 py-3 text-[14px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saveStatus === 'success' && (
              <span className="text-[14px] text-emerald-500 font-medium">Saved successfully</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[14px] text-red-400 font-medium">Failed to save</span>
            )}
          </div>
        </section>

        {/* ── Chart Theme ──────────────────────────────────────────── */}
        <ChartThemeSelector />

        {/* ── Data Sources ─────────────────────────────────────────── */}
        <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[17px] font-semibold text-text-primary mb-1">Data Sources</h2>
              <p className="text-[14px] text-text-muted">Uploaded files and database connections.</p>
            </div>
            <button
              onClick={() => navigate('/sources')}
              className="px-4 py-2.5 text-[14px] font-medium rounded-xl border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
            >
              Manage Sources
            </button>
          </div>

          {sourcesLoading ? (
            <p className="text-[14px] text-text-muted py-4">Loading...</p>
          ) : sources.length === 0 ? (
            <p className="text-[14px] text-text-muted py-4">No data sources yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sources.map((s) => (
                <div
                  key={s.source_id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-input border border-border-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-[12px] font-semibold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                        TYPE_BADGES[s.type] ?? 'bg-gray-500/15 text-gray-400'
                      }`}
                    >
                      {s.type}
                    </span>
                    <span className="text-[14px] text-text-primary font-medium truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[13px] text-text-muted shrink-0">
                    {s.row_count > 0 && <span>{s.row_count.toLocaleString()} rows</span>}
                    {s.column_count > 0 && <span>{s.column_count} cols</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── About ────────────────────────────────────────────────── */}
        <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
          <h2 className="text-[17px] font-semibold text-text-primary mb-3">About</h2>
          <p className="text-[15px] text-text-secondary leading-relaxed">
            <a href="https://storyanalytics.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Story Analytics</a> v2.0
          </p>
          <p className="text-[14px] text-text-muted leading-relaxed mt-1.5">
            Publication-ready dashboards from any data source. {' '}
            <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">MIT License</a>.{' '}
          </p>
          <p className="text-[14px] text-text-muted leading-relaxed mt-1.5">
            Created by <a href="https://andrewchamberlain.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Andrew Chamberlain, Ph.D.</a>
          </p>
        </section>


      </div>
    </div>
  )
}

// ── Chart Theme Selector ────────────────────────────────────────────────────

function ChartThemeSelector() {
  const { themeId, setChartTheme } = useChartThemeStore()
  const themes = Object.values(CHART_THEMES)

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">Chart Theme</h2>
      <p className="text-[14px] text-text-muted mb-5">Choose a visual style for all charts.</p>

      <div className="grid grid-cols-2 gap-4">
        {themes.map((t) => {
          const active = t.id === themeId
          return (
            <button
              key={t.id}
              onClick={() => setChartTheme(t.id)}
              className={`relative flex flex-col rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                active
                  ? 'border-blue-500 shadow-md'
                  : 'border-border-default hover:border-border-strong'
              }`}
            >
              {/* Accent bar preview */}
              {t.accent ? (
                <div style={{ height: t.accent.barHeight + 1, background: t.accent.color }} />
              ) : (
                <div style={{ height: 4, background: 'transparent' }} />
              )}

              <div className="px-4 py-3.5">
                {/* Palette swatches */}
                <div className="flex gap-1 mb-3">
                  {t.palette.colors.slice(0, 6).map((color, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Fake text preview lines */}
                <div className="flex flex-col gap-1.5 mb-3">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: '70%',
                      backgroundColor: t.font.title.color || 'var(--color-text-primary)',
                      opacity: 0.6,
                    }}
                  />
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: '50%',
                      backgroundColor: t.font.subtitle.color || 'var(--color-text-secondary)',
                      opacity: 0.4,
                    }}
                  />
                </div>

                {/* Theme name + description */}
                <p className="text-[14px] font-semibold text-text-primary text-left">{t.name}</p>
                <p className="text-[12px] text-text-muted text-left mt-0.5">{t.description}</p>
              </div>

              {/* Active check */}
              {active && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
