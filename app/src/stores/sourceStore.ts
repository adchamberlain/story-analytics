/**
 * Source store for managing data sources and semantic layer state.
 */

import { create } from 'zustand'
import {
  fetchSourcesExtended,
  fetchSemanticLayer,
  updateSemanticLayer,
  generateSemanticLayer,
  type SourceInfoExtended,
  type SemanticLayerResponse,
  type TableSemantic,
} from '../api/client'

interface SourceState {
  // Sources list
  sources: SourceInfoExtended[]
  sourcesLoading: boolean
  sourcesError: string | null

  // Selected source & semantic layer
  selectedSource: string | null
  semanticLayer: SemanticLayerResponse | null
  semanticLoading: boolean
  semanticError: string | null

  // Selected table for detail view
  selectedTable: string | null

  // Schema browser modal
  schemaBrowserOpen: boolean

  // Edit state
  pendingChanges: Map<string, Record<string, unknown>>
  saving: boolean
  saveError: string | null

  // Generation state
  generating: boolean
  generateError: string | null

  // Actions
  loadSources: () => Promise<void>
  selectSource: (sourceName: string | null) => void
  loadSemanticLayer: (sourceName: string) => Promise<void>
  selectTable: (tableName: string | null) => void
  openSchemaBrowser: (sourceName?: string) => void
  closeSchemaBrowser: () => void
  updateTableField: (tableName: string, field: string, value: unknown) => void
  updateColumnField: (tableName: string, columnName: string, field: string, value: unknown) => void
  saveChanges: () => Promise<boolean>
  discardChanges: () => void
  generateSemantic: (provider?: string, force?: boolean) => Promise<boolean>
}

export const useSourceStore = create<SourceState>((set, get) => ({
  // Initial state
  sources: [],
  sourcesLoading: false,
  sourcesError: null,

  selectedSource: null,
  semanticLayer: null,
  semanticLoading: false,
  semanticError: null,

  selectedTable: null,

  schemaBrowserOpen: false,

  pendingChanges: new Map(),
  saving: false,
  saveError: null,

  generating: false,
  generateError: null,

  // Load all sources
  loadSources: async () => {
    set({ sourcesLoading: true, sourcesError: null })
    try {
      const sources = await fetchSourcesExtended()
      set({ sources, sourcesLoading: false })
    } catch (error) {
      set({
        sourcesError: error instanceof Error ? error.message : 'Failed to load sources',
        sourcesLoading: false,
      })
    }
  },

  // Select a source
  selectSource: (sourceName) => {
    set({
      selectedSource: sourceName,
      selectedTable: null,
      semanticLayer: null,
      pendingChanges: new Map(),
    })
    if (sourceName) {
      get().loadSemanticLayer(sourceName)
    }
  },

  // Load semantic layer for a source
  loadSemanticLayer: async (sourceName) => {
    set({ semanticLoading: true, semanticError: null })
    try {
      const layer = await fetchSemanticLayer(sourceName)
      set({
        semanticLayer: layer,
        semanticLoading: false,
        // Auto-select first table if there is one
        selectedTable: layer.tables.length > 0 ? layer.tables[0].name : null,
      })
    } catch (error) {
      set({
        semanticError: error instanceof Error ? error.message : 'Failed to load semantic layer',
        semanticLoading: false,
      })
    }
  },

  // Select a table
  selectTable: (tableName) => {
    set({ selectedTable: tableName })
  },

  // Open schema browser modal
  openSchemaBrowser: (sourceName) => {
    set({ schemaBrowserOpen: true })
    if (sourceName) {
      get().selectSource(sourceName)
    } else if (!get().selectedSource && get().sources.length > 0) {
      // Auto-select first source if none selected
      get().selectSource(get().sources[0].name)
    }
  },

  // Close schema browser modal
  closeSchemaBrowser: () => {
    set({ schemaBrowserOpen: false })
  },

  // Update a table field (pending change)
  updateTableField: (tableName, field, value) => {
    const key = `table:${tableName}`
    const changes = new Map(get().pendingChanges)
    const tableChanges = changes.get(key) || {}
    tableChanges[field] = value
    changes.set(key, tableChanges)
    set({ pendingChanges: changes })
  },

  // Update a column field (pending change)
  updateColumnField: (tableName, columnName, field, value) => {
    const key = `column:${tableName}:${columnName}`
    const changes = new Map(get().pendingChanges)
    const colChanges = changes.get(key) || {}
    colChanges[field] = value
    changes.set(key, colChanges)
    set({ pendingChanges: changes })
  },

  // Save all pending changes
  saveChanges: async () => {
    const { selectedSource, pendingChanges } = get()
    if (!selectedSource || pendingChanges.size === 0) return true

    set({ saving: true, saveError: null })

    try {
      // Save each pending change
      for (const [key, updates] of pendingChanges.entries()) {
        if (key.startsWith('table:')) {
          const tableName = key.split(':')[1]
          await updateSemanticLayer(selectedSource, {
            table_name: tableName,
            updates,
          })
        } else if (key.startsWith('column:')) {
          const [, tableName, columnName] = key.split(':')
          await updateSemanticLayer(selectedSource, {
            table_name: tableName,
            column_name: columnName,
            updates,
          })
        }
      }

      // Clear pending changes and reload
      set({ pendingChanges: new Map(), saving: false })
      await get().loadSemanticLayer(selectedSource)
      return true
    } catch (error) {
      set({
        saveError: error instanceof Error ? error.message : 'Failed to save changes',
        saving: false,
      })
      return false
    }
  },

  // Discard pending changes
  discardChanges: () => {
    set({ pendingChanges: new Map() })
  },

  // Generate semantic layer using AI
  generateSemantic: async (provider?: string, force?: boolean) => {
    const { selectedSource } = get()
    if (!selectedSource) return false

    set({ generating: true, generateError: null })

    try {
      const result = await generateSemanticLayer(selectedSource, { provider, force })

      if (result.success) {
        // Reload sources list to update has_semantic_layer status
        await get().loadSources()
        // Reload semantic layer
        await get().loadSemanticLayer(selectedSource)
        set({ generating: false })
        return true
      } else {
        set({ generating: false, generateError: result.message })
        return false
      }
    } catch (error) {
      set({
        generating: false,
        generateError: error instanceof Error ? error.message : 'Failed to generate semantic layer',
      })
      return false
    }
  },
}))

// Helper to get merged table data (original + pending changes)
export function getMergedTableData(
  table: TableSemantic,
  pendingChanges: Map<string, Record<string, unknown>>
): TableSemantic {
  const tableKey = `table:${table.name}`
  const tableChanges = pendingChanges.get(tableKey) || {}

  const mergedColumns = table.columns.map((col) => {
    const colKey = `column:${table.name}:${col.name}`
    const colChanges = pendingChanges.get(colKey) || {}
    return { ...col, ...colChanges }
  })

  return {
    ...table,
    ...tableChanges,
    columns: mergedColumns,
  }
}
