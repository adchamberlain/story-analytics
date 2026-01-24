/**
 * Dashboard state management using Zustand.
 * Manages chart data, filters, and loading states.
 */

import { create } from 'zustand'
import type { ChartRenderData, FilterState } from '../types/chart'
import type { DashboardRenderData } from '../types/dashboard'
import { fetchChartRenderData, fetchDashboardRenderData, executeQuery } from '../api/client'

interface DashboardState {
  // Current chart data
  currentChart: ChartRenderData | null
  chartLoading: boolean
  chartError: string | null

  // Current dashboard data
  currentDashboard: DashboardRenderData | null
  dashboardLoading: boolean
  dashboardError: string | null

  // Filter states
  filters: FilterState

  // Actions
  loadChart: (chartId: string) => Promise<void>
  loadDashboard: (slug: string) => Promise<void>
  setFilter: (name: string, value: string | number | { start: string; end: string }) => void
  refreshChartData: () => Promise<void>
  clearChart: () => void
  clearDashboard: () => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  currentChart: null,
  chartLoading: false,
  chartError: null,

  currentDashboard: null,
  dashboardLoading: false,
  dashboardError: null,

  filters: {},

  // Load a single chart
  loadChart: async (chartId: string) => {
    set({ chartLoading: true, chartError: null })

    try {
      const data = await fetchChartRenderData(chartId)
      set({ currentChart: data, chartLoading: false })
    } catch (error) {
      set({
        chartError: error instanceof Error ? error.message : 'Failed to load chart',
        chartLoading: false,
      })
    }
  },

  // Load a dashboard
  loadDashboard: async (slug: string) => {
    set({ dashboardLoading: true, dashboardError: null })

    try {
      const data = await fetchDashboardRenderData(slug)
      set({ currentDashboard: data, dashboardLoading: false })
    } catch (error) {
      set({
        dashboardError: error instanceof Error ? error.message : 'Failed to load dashboard',
        dashboardLoading: false,
      })
    }
  },

  // Set a filter value
  setFilter: (name, value) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [name]: value,
      },
    }))
  },

  // Refresh chart data with current filters
  refreshChartData: async () => {
    const { currentChart, filters } = get()

    if (!currentChart) return

    try {
      const result = await executeQuery(currentChart.spec.sql, filters)
      set({
        currentChart: {
          ...currentChart,
          data: result.data as Record<string, unknown>[],
          columns: result.columns,
        },
      })
    } catch (error) {
      console.error('Failed to refresh chart data:', error)
    }
  },

  // Clear current chart
  clearChart: () => {
    set({
      currentChart: null,
      chartError: null,
      filters: {},
    })
  },

  // Clear current dashboard
  clearDashboard: () => {
    set({
      currentDashboard: null,
      dashboardError: null,
      filters: {},
    })
  },
}))
