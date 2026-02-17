import { create } from 'zustand'
import { CHART_THEMES, type ChartTheme } from '../themes/chartThemes'

interface ChartThemeState {
  themeId: string
  theme: ChartTheme
  setChartTheme: (id: string) => void
}

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('chartTheme') : null
const initialId = stored && stored in CHART_THEMES ? stored : 'default'

export const useChartThemeStore = create<ChartThemeState>((set) => ({
  themeId: initialId,
  theme: CHART_THEMES[initialId],
  setChartTheme: (id) => {
    const theme = CHART_THEMES[id] ?? CHART_THEMES.default
    localStorage.setItem('chartTheme', id)
    set({ themeId: id, theme })
  },
}))
