/**
 * Chart library state management using Zustand.
 * Manages chart list, search/filter, and selection state.
 */

import { create } from 'zustand'
import type { ChartLibraryItem } from '../types/conversation'
import {
  getCharts,
  deleteChart as apiDeleteChart,
  getChartPreviewUrl as apiGetChartPreviewUrl,
} from '../api/client'

interface ChartState {
  // Chart list
  charts: ChartLibraryItem[]
  loading: boolean
  error: string | null

  // Search and filter
  searchQuery: string
  filterType: string

  // Selection mode (for dashboard composition)
  selectionMode: boolean
  selectedChartIds: string[]

  // Preview
  previewChart: ChartLibraryItem | null
  previewUrl: string | null

  // Actions
  loadCharts: (query?: string, chartType?: string) => Promise<void>
  deleteChart: (chartId: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setFilterType: (type: string) => void
  toggleSelectionMode: () => void
  toggleChartSelection: (chartId: string) => void
  clearSelection: () => void
  openPreview: (chart: ChartLibraryItem) => Promise<void>
  closePreview: () => void
}

export const useChartStore = create<ChartState>((set, get) => ({
  // Initial state
  charts: [],
  loading: false,
  error: null,
  searchQuery: '',
  filterType: '',
  selectionMode: false,
  selectedChartIds: [],
  previewChart: null,
  previewUrl: null,

  // Load charts with optional search/filter
  loadCharts: async (query?: string, chartType?: string) => {
    set({ loading: true, error: null })
    try {
      const response = await getCharts({
        query: query || get().searchQuery || undefined,
        chart_type: chartType || get().filterType || undefined,
      })
      set({ charts: response.charts, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load charts',
        loading: false,
      })
    }
  },

  // Delete a chart
  deleteChart: async (chartId: string) => {
    try {
      await apiDeleteChart(chartId)
      set((state) => ({
        charts: state.charts.filter((c) => c.id !== chartId),
        selectedChartIds: state.selectedChartIds.filter((id) => id !== chartId),
      }))
    } catch (error) {
      throw error
    }
  },

  // Search and filter
  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  setFilterType: (type: string) => {
    set({ filterType: type })
  },

  // Selection mode
  toggleSelectionMode: () => {
    set((state) => ({
      selectionMode: !state.selectionMode,
      selectedChartIds: state.selectionMode ? [] : state.selectedChartIds,
    }))
  },

  toggleChartSelection: (chartId: string) => {
    set((state) => ({
      selectedChartIds: state.selectedChartIds.includes(chartId)
        ? state.selectedChartIds.filter((id) => id !== chartId)
        : [...state.selectedChartIds, chartId],
    }))
  },

  clearSelection: () => {
    set({ selectedChartIds: [] })
  },

  // Preview
  openPreview: async (chart: ChartLibraryItem) => {
    set({ previewChart: chart, previewUrl: null })
    try {
      const url = await apiGetChartPreviewUrl(chart.id)
      // Add cache-busting parameter to ensure fresh data
      const cacheBuster = `?t=${Date.now()}`
      set({ previewUrl: url + cacheBuster })
    } catch (error) {
      console.error('Failed to get preview URL:', error)
    }
  },

  closePreview: () => {
    set({ previewChart: null, previewUrl: null })
  },
}))
