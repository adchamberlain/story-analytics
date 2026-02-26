import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authFetch } from '../utils/authFetch'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useChartThemeStore } from '../stores/chartThemeStore'
import { CHART_THEMES } from '../themes/chartThemes'
import { useLocaleStore, SUPPORTED_LOCALES } from '../stores/localeStore'
import { useAuthStore } from '../stores/authStore'

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
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(saveTimer.current)
  }, [])

  // Data sources state
  const [sources, setSources] = useState<DataSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)

  // Load settings on mount
  useEffect(() => {
    authFetch('/api/settings/')
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
    authFetch('/api/settings/sources')
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
    const provider = PROVIDERS.find((p) => p.id === selectedProvider)
    if (!provider) return

    setSaving(true)
    setSaveStatus('idle')

    const body: Record<string, string> = { ai_provider: selectedProvider }
    // Only send key if it's not a masked value (i.e., user typed a new one)
    if (apiKey && !apiKey.includes('****')) {
      body[provider.keyField] = apiKey
    }

    try {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      const data: Settings = await res.json()
      setSettings(data)
      setApiKey(data[provider.keyField])
      setSaveStatus('success')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
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

        {/* ── Account (Change Password) ─────────────────────────── */}
        <ChangePasswordSection />

        {/* ── User Management (Admin) ─────────────────────── */}
        <AdminUsersSection />

        {/* ── Chart Theme ──────────────────────────────────────────── */}
        <ChartThemeSelector />

        {/* ── Locale ───────────────────────────────────────────────── */}
        <LocaleSelector />

        {/* ── API Keys ──────────────────────────────────────────── */}
        <ApiKeyManager />

        {/* ── Teams ────────────────────────────────────────────────── */}
        <TeamManager />

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary mb-1">Chart Theme</h2>
          <p className="text-[14px] text-text-muted">Choose a visual style for all charts.</p>
        </div>
        <Link
          to="/settings/themes"
          className="px-4 py-2.5 text-[14px] font-medium rounded-xl border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
        >
          Customize Themes
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
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

// ── API Key Manager ─────────────────────────────────────────────────────────

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string
  last_used_at: string | null
  created_at: string
}

function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    authFetch('/api/api-keys/')
      .then((r) => r.ok ? r.json() : [])
      .then(setKeys)
      .catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await authFetch('/api/api-keys/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create key')
      const data = await res.json()
      setCreatedKey(data.key)
      setNewKeyName('')
      // Refresh list
      const listRes = await authFetch('/api/api-keys/')
      if (listRes.ok) setKeys(await listRes.json())
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null)

  const handleRevoke = useCallback(async () => {
    if (!revokeKeyId) return
    await authFetch(`/api/api-keys/${revokeKeyId}`, { method: 'DELETE' })
    setKeys((prev) => prev.filter((k) => k.id !== revokeKeyId))
    setRevokeKeyId(null)
  }, [revokeKeyId])

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">API Keys</h2>
      <p className="text-[14px] text-text-muted mb-5">
        Create API keys for programmatic access. Keys are shown only once when created.
      </p>

      {/* Created key banner */}
      {createdKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-emerald-800 font-medium mb-1">API key created. Copy it now -- it won't be shown again.</p>
          <code className="text-xs bg-white border border-emerald-200 rounded px-2 py-1 block break-all select-all">
            {createdKey}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(createdKey); setCreatedKey(null) }}
            className="text-xs text-emerald-700 underline mt-2"
          >
            Copy &amp; dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g., 'CI Pipeline')"
          className="flex-1 px-3 py-2.5 text-[14px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newKeyName.trim()}
          className="px-4 py-2.5 text-[14px] font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Key'}
        </button>
      </div>

      {/* Keys list */}
      {keys.length === 0 ? (
        <p className="text-[14px] text-text-muted py-2">No API keys yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-input border border-border-default"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] text-text-primary font-medium">{k.name}</span>
                <span className="text-[12px] text-text-muted font-mono">{k.key_prefix}...</span>
              </div>
              <div className="flex items-center gap-4">
                {k.last_used_at && (
                  <span className="text-[12px] text-text-muted">
                    Last used: {new Date(k.last_used_at).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => setRevokeKeyId(k.id)}
                  className="text-[13px] text-red-500 hover:text-red-400 transition-colors"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {revokeKeyId && (
        <ConfirmDialog
          title="Revoke API key"
          message="Are you sure you want to revoke this API key? This cannot be undone."
          confirmLabel="Revoke"
          destructive
          onConfirm={handleRevoke}
          onCancel={() => setRevokeKeyId(null)}
        />
      )}
    </section>
  )
}

// ── Team Manager ────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  email: string
  display_name: string
  joined_at: string
}

interface Team {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
  members?: TeamMember[]
}

function TeamManager() {
  const { user } = useAuthStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [membersByTeam, setMembersByTeam] = useState<Record<string, TeamMember[]>>({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    authFetch('/api/teams/')
      .then((r) => r.ok ? r.json() : [])
      .then(setTeams)
      .catch(() => {})
  }, [])

  const loadMembers = async (teamId: string) => {
    try {
      const res = await authFetch(`/api/teams/${teamId}`)
      if (!res.ok) return
      const data = await res.json()
      setMembersByTeam((prev) => ({ ...prev, [teamId]: data.members || [] }))
    } catch { /* ignore */ }
  }

  const toggleExpand = (teamId: string) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null)
    } else {
      setExpandedTeamId(teamId)
      setInviteEmail('')
      setInviteError('')
      if (!membersByTeam[teamId]) loadMembers(teamId)
    }
  }

  const handleCreate = async () => {
    if (!newTeamName.trim()) return
    setCreating(true)
    try {
      const res = await authFetch('/api/teams/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      setNewTeamName('')
      const listRes = await authFetch('/api/teams/')
      if (listRes.ok) setTeams(await listRes.json())
    } catch { /* ignore */ } finally { setCreating(false) }
  }

  const handleInvite = async (teamId: string) => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    try {
      const res = await authFetch(`/api/teams/${teamId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Failed to invite' }))
        throw new Error(body.detail)
      }
      const data = await res.json()
      setInviteEmail('')
      if (data.status === 'added') {
        await loadMembers(teamId)
      }
      setInviteError(data.status === 'added' ? '✓ Added to team' : '✓ Invite sent')
      setTimeout(() => setInviteError(''), 3000)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (teamId: string, userId: string) => {
    try {
      const res = await authFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
      if (!res.ok) return
      setMembersByTeam((prev) => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter((m) => m.user_id !== userId),
      }))
    } catch { /* ignore */ }
  }

  const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null)

  const handleDelete = useCallback(async () => {
    if (!deleteTeamId) return
    await authFetch(`/api/teams/${deleteTeamId}`, { method: 'DELETE' })
    setTeams((prev) => prev.filter((t) => t.id !== deleteTeamId))
    if (expandedTeamId === deleteTeamId) setExpandedTeamId(null)
    setDeleteTeamId(null)
  }, [deleteTeamId, expandedTeamId])

  const isAdmin = (teamId: string) => {
    const members = membersByTeam[teamId]
    if (!members || !user) return false
    const me = members.find((m) => m.user_id === user.id)
    return me?.role === 'admin'
  }

  const ROLE_BADGES: Record<string, string> = {
    admin: 'bg-amber-500/15 text-amber-500',
    member: 'bg-blue-500/15 text-blue-400',
  }

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">Teams</h2>
      <p className="text-[14px] text-text-muted mb-5">Create teams to organize collaboration.</p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="Team name"
          className="flex-1 px-3 py-2.5 text-[14px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newTeamName.trim()}
          className="px-4 py-2.5 text-[14px] font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>

      {teams.length === 0 ? (
        <p className="text-[14px] text-text-muted py-2">No teams yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {teams.map((t) => {
            const expanded = expandedTeamId === t.id
            const members = membersByTeam[t.id]
            const admin = isAdmin(t.id)

            return (
              <div key={t.id} className="rounded-xl bg-surface-input border border-border-default overflow-hidden">
                {/* Team header row */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-input/80 transition-colors"
                  onClick={() => toggleExpand(t.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <svg
                      className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-[14px] text-text-primary font-medium">{t.name}</span>
                    {members && (
                      <span className="text-[12px] text-text-muted bg-surface-raised px-2 py-0.5 rounded-full">
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTeamId(t.id) }}
                    className="text-[13px] text-red-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>

                {/* Expanded member list */}
                {expanded && (
                  <div className="border-t border-border-default px-4 py-3">
                    {!members ? (
                      <p className="text-[13px] text-text-muted py-2">Loading members...</p>
                    ) : members.length === 0 ? (
                      <p className="text-[13px] text-text-muted py-2">No members.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {members.map((m) => {
                          const isOwner = m.user_id === t.owner_id
                          return (
                            <div
                              key={m.user_id}
                              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-raised/50 transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-[14px] text-text-primary">{m.display_name}</span>
                                <span className="text-[12px] text-text-muted">{m.email}</span>
                                {isOwner ? (
                                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400">
                                    Owner
                                  </span>
                                ) : (
                                  <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${ROLE_BADGES[m.role] ?? ROLE_BADGES.member}`}>
                                    {m.role}
                                  </span>
                                )}
                              </div>
                              {admin && !isOwner && (
                                <button
                                  onClick={() => handleRemoveMember(t.id, m.user_id)}
                                  className="text-[12px] text-red-500 hover:text-red-400 transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Invite form (visible to admins) */}
                    {admin && (
                      <div className="pt-2 border-t border-border-default">
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => { setInviteEmail(e.target.value); setInviteError('') }}
                            placeholder="Email address"
                            className="flex-1 px-3 py-2 text-[13px] rounded-lg bg-surface-raised border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            onKeyDown={(e) => e.key === 'Enter' && handleInvite(t.id)}
                          />
                          <button
                            onClick={() => handleInvite(t.id)}
                            disabled={inviting || !inviteEmail.trim()}
                            className="px-3 py-2 text-[13px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                          >
                            {inviting ? 'Inviting...' : 'Invite'}
                          </button>
                        </div>
                        {inviteError && (
                          <p className={`text-[12px] mt-1.5 ${inviteError.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{inviteError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {deleteTeamId && (
        <ConfirmDialog
          title="Delete team"
          message="Are you sure you want to delete this team?"
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setDeleteTeamId(null)}
        />
      )}
    </section>
  )
}

// ── Admin User Management ────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
  is_active: number
}

interface Invite {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
}

function AdminUsersSection() {
  const { authEnabled, user } = useAuthStore()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [settings, setSettings] = useState<{ open_registration: string }>({ open_registration: 'true' })

  const isAdmin = authEnabled && user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      authFetch('/api/admin/users').then(r => r.ok ? r.json() : []),
      authFetch('/api/admin/invites').then(r => r.ok ? r.json() : []),
      authFetch('/api/admin/settings').then(r => r.ok ? r.json() : { open_registration: 'true' }),
    ]).then(([usersData, invitesData, settingsData]) => {
      setUsers(usersData)
      setInvites(invitesData)
      setSettings(settingsData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [isAdmin])

  if (!isAdmin) return null

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await authFetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
  }

  const handleStatusChange = async (userId: string, active: boolean) => {
    const res = await authFetch(`/api/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: active ? 1 : 0 } : u))
    }
  }

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim()) return
    setCreating(true)
    setInviteError('')
    try {
      const res = await authFetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Failed to create invite' }))
        throw new Error(body.detail)
      }
      const data = await res.json()
      setInviteUrl(data.invite_url)
      const invRes = await authFetch('/api/admin/invites')
      if (invRes.ok) setInvites(await invRes.json())
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteInvite = async (inviteId: string) => {
    await authFetch(`/api/admin/invites/${inviteId}`, { method: 'DELETE' })
    setInvites(prev => prev.filter(i => i.id !== inviteId))
  }

  const handleToggleOpenRegistration = async () => {
    const newValue = settings.open_registration === 'true' ? 'false' : 'true'
    const res = await authFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_registration: newValue }),
    })
    if (res.ok) {
      setSettings(await res.json())
    }
  }

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-amber-500/15 text-amber-500',
    editor: 'bg-blue-500/15 text-blue-400',
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 30) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary mb-1">User Management</h2>
          <p className="text-[14px] text-text-muted">Manage users, roles, and invitations.</p>
        </div>
        <button
          onClick={() => { setShowInviteModal(true); setInviteEmail(''); setInviteRole('editor'); setInviteUrl(null); setInviteError('') }}
          className="px-4 py-2.5 text-[14px] font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Invite User
        </button>
      </div>

      {/* Open registration toggle */}
      <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl bg-surface-input border border-border-default">
        <label className="flex items-center gap-2.5 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={settings.open_registration === 'true'}
            onChange={handleToggleOpenRegistration}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <span className="text-[14px] text-text-primary font-medium">Allow open registration</span>
        </label>
        <span className="text-[13px] text-text-muted">
          {settings.open_registration === 'true' ? 'Anyone can create an account' : 'Invite-only'}
        </span>
      </div>

      {loading ? (
        <p className="text-[14px] text-text-muted py-4">Loading users...</p>
      ) : (
        <>
          {/* Users table */}
          <div className="flex flex-col gap-1.5">
            {users.map((u) => {
              const isSelf = u.id === user?.id
              const inactive = !u.is_active
              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border border-border-default ${
                    inactive ? 'bg-surface-input/50 opacity-60' : 'bg-surface-input'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-text-primary font-medium truncate">
                        {u.display_name || u.email}
                      </span>
                      <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${ROLE_COLORS[u.role] || ROLE_COLORS.editor}`}>
                        {u.role}
                      </span>
                      {inactive && (
                        <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-red-500/15 text-red-400">
                          Inactive
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-[11px] text-text-muted">(you)</span>
                      )}
                    </div>
                    <span className="text-[12px] text-text-muted">{u.email}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[12px] text-text-muted">{formatDate(u.created_at)}</span>

                    {!isSelf && (
                      <>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="text-[12px] bg-surface-raised border border-border-default rounded-lg px-2 py-1 text-text-secondary cursor-pointer"
                        >
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>

                        <button
                          onClick={() => handleStatusChange(u.id, !u.is_active)}
                          className={`text-[12px] font-medium transition-colors ${
                            u.is_active
                              ? 'text-red-500 hover:text-red-400'
                              : 'text-emerald-500 hover:text-emerald-400'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pending invites */}
          {invites.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border-default">
              <h3 className="text-[14px] font-medium text-text-secondary mb-3">Pending Invites</h3>
              <div className="flex flex-col gap-1.5">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-input border border-border-default"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] text-text-primary">{inv.email}</span>
                      <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${ROLE_COLORS[inv.role] || ROLE_COLORS.editor}`}>
                        {inv.role}
                      </span>
                      <span className="text-[12px] text-text-muted">
                        Expires {formatDate(inv.expires_at)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      className="text-[12px] text-red-500 hover:text-red-400 transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-surface rounded-2xl shadow-xl border border-border-default w-full max-w-md p-7" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[17px] font-semibold text-text-primary mb-5">
              {inviteUrl ? 'Invite Created' : 'Invite User'}
            </h3>

            {inviteUrl ? (
              <div>
                <p className="text-[14px] text-text-secondary mb-3">
                  Share this link with <span className="font-medium">{inviteEmail}</span>:
                </p>
                <div className="bg-surface-input border border-border-default rounded-xl p-3 mb-4">
                  <code className="text-[13px] text-text-primary break-all select-all block">{inviteUrl}</code>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteUrl); setShowInviteModal(false) }}
                    className="flex-1 px-4 py-2.5 text-[14px] font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    Copy & Close
                  </button>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 text-[14px] font-medium rounded-xl border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); setInviteError('') }}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 text-[14px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-1.5">Role</label>
                  <div className="flex gap-2">
                    {(['editor', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInviteRole(r)}
                        className={`flex-1 py-2.5 text-[14px] font-medium rounded-xl border-2 transition-all ${
                          inviteRole === r
                            ? 'border-blue-500 bg-blue-500/10 text-text-primary'
                            : 'border-border-default text-text-secondary hover:border-border-strong'
                        }`}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {inviteError && (
                  <p className={`text-[13px] ${inviteError.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{inviteError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCreateInvite}
                    disabled={creating || !inviteEmail.trim()}
                    className="flex-1 px-4 py-2.5 text-[14px] font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create Invite Link'}
                  </button>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 text-[14px] font-medium rounded-xl border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Change Password ─────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { authEnabled, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Profile editing
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])

  useEffect(() => {
    setDisplayName(user?.display_name || '')
  }, [user?.display_name])

  if (!authEnabled) return null

  const handleSaveName = async () => {
    if (!displayName.trim()) return
    setSavingName(true)
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditingName(false)
    } catch {
      // ignore
    } finally {
      setSavingName(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('idle')
    setErrorMsg('')

    if (newPassword.length < 6) {
      setStatus('error')
      setErrorMsg('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setStatus('error')
      setErrorMsg('New passwords do not match')
      return
    }

    setSaving(true)
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Failed to change password' }))
        throw new Error(body.detail)
      }
      setStatus('success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 text-[14px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all'

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-amber-500/15 text-amber-500',
    editor: 'bg-blue-500/15 text-blue-400',
  }

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Account</h2>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-[14px] font-medium rounded-xl border border-border-default text-text-secondary hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          Log Out
        </button>
      </div>

      {/* Profile info */}
      <div className="flex flex-col gap-3 mb-6 pb-6 border-b border-border-default">
        <div className="flex items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="px-3 py-1.5 text-[15px] rounded-lg bg-surface-input border border-border-strong text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') { setEditingName(false); setDisplayName(user?.display_name || '') }
                }}
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !displayName.trim()}
                className="text-[13px] text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50"
              >
                {savingName ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingName(false); setDisplayName(user?.display_name || '') }}
                className="text-[13px] text-text-muted hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-medium text-text-primary">{user?.display_name || user?.email}</span>
              <button
                onClick={() => setEditingName(true)}
                className="text-[12px] text-text-muted hover:text-text-secondary transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[14px] text-text-muted">{user?.email}</span>
          {user?.role && (
            <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${ROLE_COLORS[user.role] || ROLE_COLORS.editor}`}>
              {user.role}
            </span>
          )}
        </div>
      </div>

      {/* Change password form */}
      <h3 className="text-[15px] font-medium text-text-secondary mb-4">Change Password</h3>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setStatus('idle') }}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-1.5">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setStatus('idle') }}
            required
            minLength={6}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setStatus('idle') }}
            required
            minLength={6}
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="px-6 py-3 text-[14px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Changing...' : 'Change Password'}
          </button>
          {status === 'success' && (
            <span className="text-[14px] text-emerald-500 font-medium">Password changed</span>
          )}
          {status === 'error' && (
            <span className="text-[14px] text-red-400 font-medium">{errorMsg}</span>
          )}
        </div>
      </form>
    </section>
  )
}


// ── Locale Selector ─────────────────────────────────────────────────────────

function LocaleSelector() {
  const { locale, setLocale } = useLocaleStore()

  // Format preview for current locale
  const preview = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234567.89)

  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">Number Locale</h2>
      <p className="text-[14px] text-text-muted mb-5">
        Controls number, currency, and date formatting on charts. Preview: <span className="font-mono text-text-secondary">{preview}</span>
      </p>

      <div className="grid grid-cols-3 gap-2">
        {SUPPORTED_LOCALES.map((loc) => {
          const active = loc.code === locale
          return (
            <button
              key={loc.code}
              onClick={() => setLocale(loc.code)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer text-left ${
                active
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-border-default hover:border-border-strong'
              }`}
            >
              <span className="text-[14px] font-medium text-text-primary">{loc.label}</span>
              {active && (
                <svg className="w-4 h-4 text-blue-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
