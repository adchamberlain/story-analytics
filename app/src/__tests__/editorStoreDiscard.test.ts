/**
 * Regression test for editorStore.discard().
 *
 * Bug: discard() only restored config but not sql, so after discard the
 * SQL stayed stale, isDirty() remained true, and the "Unsaved" badge persisted.
 * Fix: discard() now also restores sql to savedSql and calls buildQuery().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorStore } from '../stores/editorStore'

describe('editorStore.discard() — restores sql alongside config', () => {
  beforeEach(() => {
    // Set up a "loaded chart with saved state" scenario
    const baseConfig = {
      ...useEditorStore.getState().config,
      chartType: 'BarChart' as const,
      title: 'Original Title',
    }
    useEditorStore.setState({
      chartId: 'chart-1',
      sourceId: 'src_001',
      sql: 'SELECT modified FROM src_001',       // current (dirty) sql
      savedSql: 'SELECT original FROM src_001',   // saved sql
      config: { ...baseConfig, title: 'Modified Title' },
      savedConfig: { ...baseConfig },
      configHistory: [baseConfig],
      configFuture: [],
    })

    // Stub fetch so buildQuery doesn't make a real request
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: [], sql: 'SELECT original FROM src_001' }),
    } as Response)))
  })

  it('should restore sql to savedSql on discard', () => {
    const store = useEditorStore.getState()
    expect(store.sql).toBe('SELECT modified FROM src_001')

    store.discard()

    const after = useEditorStore.getState()
    expect(after.sql).toBe('SELECT original FROM src_001')
  })

  it('should restore config to savedConfig on discard', () => {
    useEditorStore.getState().discard()

    const after = useEditorStore.getState()
    expect(after.config.title).toBe('Original Title')
  })

  it('should clear undo/redo history', () => {
    useEditorStore.getState().discard()

    const after = useEditorStore.getState()
    expect(after.configHistory).toEqual([])
    expect(after.configFuture).toEqual([])
  })

  it('should not be dirty after discard', () => {
    // Before discard: dirty
    expect(useEditorStore.getState().isDirty()).toBe(true)

    useEditorStore.getState().discard()

    // After discard: not dirty (config and sql both match saved)
    expect(useEditorStore.getState().isDirty()).toBe(false)
  })
})
