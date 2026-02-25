import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Ensure localStorage is available before module imports
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
    const store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
        get length() { return Object.keys(store).length },
        key: (i: number) => Object.keys(store)[i] ?? null,
      },
      writable: true,
      configurable: true,
    })
  }
})

// Dynamic import to ensure localStorage is set up before the module loads
let SettingsPage: () => JSX.Element

beforeAll(async () => {
  const mod = await import('../SettingsPage')
  SettingsPage = mod.SettingsPage as () => JSX.Element
})

// Mock fetch globally
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/api-keys/') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    }
    if (url === '/api/settings/') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ai_provider: 'anthropic',
          anthropic_api_key: 'sk-****',
          openai_api_key: '',
          google_api_key: '',
        }),
      })
    }
    if (url === '/api/settings/sources') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    }
    if (url === '/api/teams/') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  it('renders API Keys section heading', () => {
    renderPage()
    expect(screen.getByText('API Keys')).toBeDefined()
  })

  it('shows "No API keys yet" when empty', async () => {
    renderPage()
    const noKeys = await screen.findByText('No API keys yet.')
    expect(noKeys).toBeDefined()
  })

  it('has a Create Key button and input', () => {
    renderPage()
    expect(screen.getByPlaceholderText("Key name (e.g., 'CI Pipeline')")).toBeDefined()
    expect(screen.getByText('Create Key')).toBeDefined()
  })
})
