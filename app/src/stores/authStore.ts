import { create } from 'zustand'

interface User {
  id: string
  email: string
  display_name?: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  authEnabled: boolean
  loading: boolean

  checkStatus: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string, inviteToken?: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: (() => { try { return localStorage.getItem('auth_token') } catch { return null } })(),
  authEnabled: false,
  loading: true,

  checkStatus: async () => {
    try {
      const token = get().token
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/auth/status', { headers })
      const data = await res.json()

      // If auth is enabled but token is invalid (no user returned), clear it
      if (data.auth_enabled && token && !data.user) {
        localStorage.removeItem('auth_token')
        set({ token: null })
      }

      set({
        authEnabled: data.auth_enabled,
        user: data.user ?? null,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  login: async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(body.detail)
    }
    const data = await res.json()
    localStorage.setItem('auth_token', data.token)
    set({ token: data.token, user: data.user })
  },

  register: async (email: string, password: string, displayName?: string, inviteToken?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName, invite_token: inviteToken }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: 'Registration failed' }))
      throw new Error(body.detail)
    }
    const data = await res.json()
    localStorage.setItem('auth_token', data.token)
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    set({ token: null, user: null })
  },
}))
