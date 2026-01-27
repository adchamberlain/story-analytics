/**
 * Settings page.
 * User account info, provider selection, and data source.
 */

import { useEffect, useState } from 'react'
import { useConversationStore } from '../stores/conversationStore'
import {
  getProviders,
  getSources,
  updateProvider,
  updateSource,
} from '../api/client'
import type { Provider, SourceInfo } from '../types/conversation'

export function SettingsPage() {
  const { user, loadUser } = useConversationStore()
  const [providers, setProviders] = useState<Provider[]>([])
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  // Load providers and sources on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [providersData, sourcesData] = await Promise.all([
          getProviders(),
          getSources(),
        ])
        setProviders(providersData.providers)
        setSources(sourcesData)
      } catch (error) {
        console.error('Failed to load settings data:', error)
      }
    }
    loadData()
  }, [])

  const handleProviderChange = async (provider: string) => {
    setSaving('provider')
    try {
      await updateProvider(provider)
      await loadUser()
    } catch (error) {
      console.error('Failed to update provider:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleSourceChange = async (source: string) => {
    setSaving('source')
    try {
      await updateSource(source)
      await loadUser()
    } catch (error) {
      console.error('Failed to update source:', error)
    } finally {
      setSaving(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-6)',
        backgroundColor: 'var(--color-gray-900)',
      }}
    >
      <h1
        style={{
          margin: '0 0 var(--space-6) 0',
          fontSize: 'var(--text-lg)',
          fontWeight: 700,
          color: 'var(--color-primary)',
        }}
      >
        Settings
      </h1>

      <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Account Info */}
        <section
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-700)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h2
            style={{
              margin: '0 0 var(--space-4) 0',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              color: 'var(--color-warning)',
            }}
          >
            Account
          </h2>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: '100px', color: 'var(--color-gray-400)' }}>Name:</span>
                <span style={{ color: 'var(--color-gray-200)' }}>{user.name}</span>
              </div>
              <div style={{ display: 'flex', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: '100px', color: 'var(--color-gray-400)' }}>Email:</span>
                <span style={{ color: 'var(--color-gray-200)' }}>{user.email}</span>
              </div>
              <div style={{ display: 'flex', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: '100px', color: 'var(--color-gray-400)' }}>Joined:</span>
                <span style={{ color: 'var(--color-gray-200)' }}>{formatDate(user.created_at)}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-sm)' }}>
              Loading...
            </p>
          )}
        </section>

        {/* AI Provider */}
        <section
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-700)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h2
            style={{
              margin: '0 0 var(--space-4) 0',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              color: 'var(--color-warning)',
            }}
          >
            AI Provider
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {providers.map((provider) => (
              <label
                key={provider.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={user?.preferred_provider === provider.id}
                  onChange={() => handleProviderChange(provider.id)}
                  disabled={saving === 'provider'}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--color-gray-200)', fontSize: 'var(--text-sm)' }}>
                  {provider.name}
                </span>
              </label>
            ))}
            {saving === 'provider' && (
              <span style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-xs)' }}>
                Saving...
              </span>
            )}
          </div>
        </section>

        {/* API Keys Info */}
        <section
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-700)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h2
            style={{
              margin: '0 0 var(--space-2) 0',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              color: 'var(--color-warning)',
            }}
          >
            API Keys
          </h2>
          <p
            style={{
              margin: '0 0 var(--space-3) 0',
              color: 'var(--color-gray-400)',
              fontSize: 'var(--text-sm)',
            }}
          >
            API keys are configured via environment variables on the server:
          </p>
          <ul
            style={{
              margin: 0,
              padding: '0 0 0 var(--space-4)',
              color: 'var(--color-gray-400)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <li>
              <code style={{ color: 'var(--color-primary)' }}>ANTHROPIC_API_KEY</code> - Claude
            </li>
            <li>
              <code style={{ color: 'var(--color-primary)' }}>OPENAI_API_KEY</code> - OpenAI
            </li>
            <li>
              <code style={{ color: 'var(--color-primary)' }}>GOOGLE_API_KEY</code> - Gemini
            </li>
          </ul>
        </section>

        {/* Data Source */}
        <section
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-700)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h2
            style={{
              margin: '0 0 var(--space-2) 0',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              color: 'var(--color-warning)',
            }}
          >
            Data Source
          </h2>
          <p
            style={{
              margin: '0 0 var(--space-4) 0',
              color: 'var(--color-gray-400)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Select the data source for dashboard queries
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {sources.map((source) => (
              <label
                key={source.name}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="source"
                  value={source.name}
                  checked={user?.preferred_source === source.name}
                  onChange={() => handleSourceChange(source.name)}
                  disabled={saving === 'source'}
                  style={{ cursor: 'pointer', marginTop: '2px' }}
                />
                <div>
                  <span style={{ color: 'var(--color-gray-200)', fontSize: 'var(--text-sm)' }}>
                    {source.name}
                  </span>
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--color-gray-500)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    {source.type}
                    {source.database && ` - ${source.database}`}
                    {source.connected ? ' (connected)' : ' (not connected)'}
                  </p>
                </div>
              </label>
            ))}
            {sources.length === 0 && (
              <p style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-sm)' }}>
                No sources configured
              </p>
            )}
            {saving === 'source' && (
              <span style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-xs)' }}>
                Saving...
              </span>
            )}
          </div>
          <p
            style={{
              margin: 'var(--space-3) 0 0 0',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--text-xs)',
            }}
          >
            To add a new source, create a connection file at{' '}
            <code style={{ color: 'var(--color-primary)' }}>
              sources/&lt;name&gt;/connection.yaml
            </code>
          </p>
        </section>
      </div>
    </div>
  )
}
