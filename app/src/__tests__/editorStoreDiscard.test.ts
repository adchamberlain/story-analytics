/**
 * Regression tests for editorStore.discard().
 *
 * Bug 1: discard() only restored config but not sql, so after discard the
 * SQL stayed stale, isDirty() remained true, and the "Unsaved" badge persisted.
 * Fix: discard() now also restores sql to savedSql and calls buildQuery().
 *
 * Bug 2: discard() didn't reset customSql for SQL-mode charts, so the SQL
 * editor textarea still showed unsaved edits after discard.
 * Fix: discard() now also restores customSql based on dataMode.
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

describe('editorStore.discard() — restores customSql in SQL mode', () => {
  beforeEach(() => {
    const baseConfig = {
      ...useEditorStore.getState().config,
      chartType: 'BarChart' as const,
      title: 'SQL Chart',
      dataMode: 'sql' as const,
    }
    useEditorStore.setState({
      chartId: 'chart-2',
      sourceId: 'src_002',
      sql: 'SELECT modified FROM src_002',
      savedSql: 'SELECT original FROM src_002',
      customSql: 'SELECT modified FROM src_002',  // dirty custom SQL in editor
      config: { ...baseConfig },
      savedConfig: { ...baseConfig },
      configHistory: [],
      configFuture: [],
    })

    // Stub fetch for executeCustomSql
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: [], columns: [], rows: [] }),
    } as Response)))
  })

  it('should restore customSql to savedSql on discard in SQL mode', () => {
    expect(useEditorStore.getState().customSql).toBe('SELECT modified FROM src_002')

    useEditorStore.getState().discard()

    const after = useEditorStore.getState()
    expect(after.customSql).toBe('SELECT original FROM src_002')
  })

  it('should clear sqlError on discard', () => {
    useEditorStore.setState({ sqlError: 'some error' })

    useEditorStore.getState().discard()

    expect(useEditorStore.getState().sqlError).toBeNull()
  })
})
