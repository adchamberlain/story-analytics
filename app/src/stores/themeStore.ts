import { create } from 'zustand'

type ThemeChoice = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setTheme: (choice: ThemeChoice) => void
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function syncDOM(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as ThemeChoice | null
const initial: ThemeChoice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'

// Apply immediately (before React renders) to prevent FOUC
syncDOM(resolveTheme(initial))

export const useThemeStore = create<ThemeState>((set) => ({
  choice: initial,
  resolved: resolveTheme(initial),
  setTheme: (choice) => {
    localStorage.setItem('theme', choice)
    const resolved = resolveTheme(choice)
    syncDOM(resolved)
    set({ choice, resolved })
  },
}))

// Sync DOM on any state change (e.g. initial hydration)
useThemeStore.subscribe((state) => syncDOM(state.resolved))

// Listen for OS theme changes when in "system" mode
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { choice } = useThemeStore.getState()
    if (choice === 'system') {
      const resolved = resolveTheme('system')
      syncDOM(resolved)
      useThemeStore.setState({ resolved })
    }
  })
}
