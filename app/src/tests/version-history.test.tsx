import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── O.2: Editor store version features ──────────────────────────────────────

describe('O.2: Editor store auto-save version logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('saveCount starts at 0', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().reset()
    expect(useEditorStore.getState().saveCount).toBe(0)
  })

  it('versionHistoryOpen defaults to false', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().reset()
    expect(useEditorStore.getState().versionHistoryOpen).toBe(false)
  })

  it('setVersionHistoryOpen toggles the panel state', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().reset()
    useEditorStore.getState().setVersionHistoryOpen(true)
    expect(useEditorStore.getState().versionHistoryOpen).toBe(true)
    useEditorStore.getState().setVersionHistoryOpen(false)
    expect(useEditorStore.getState().versionHistoryOpen).toBe(false)
  })

  it('saveVersion calls the versions API with trigger manual', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().reset()

    // Set a chartId so saveVersion doesn't bail
    useEditorStore.setState({ chartId: 'test123456ab' })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ version: 1, trigger: 'manual' }), { status: 200 })
    )

    await useEditorStore.getState().saveVersion('My checkpoint')

    const versionCall = fetchSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/versions')
    )
    expect(versionCall).toBeTruthy()
    const body = JSON.parse((versionCall![1] as RequestInit).body as string)
    expect(body.trigger).toBe('manual')
    expect(body.label).toBe('My checkpoint')

    fetchSpy.mockRestore()
  })

  it('saveVersion is a no-op when chartId is null', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().reset()

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await useEditorStore.getState().saveVersion()

    // Should not have made any fetch calls (beyond any pre-existing)
    const versionCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/versions')
    )
    expect(versionCalls).toHaveLength(0)

    fetchSpy.mockRestore()
  })

  it('reset clears saveCount and versionHistoryOpen', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.setState({ saveCount: 42, versionHistoryOpen: true })
    useEditorStore.getState().reset()
    expect(useEditorStore.getState().saveCount).toBe(0)
    expect(useEditorStore.getState().versionHistoryOpen).toBe(false)
  })
})

// ── O.3: VersionHistoryPanel component ──────────────────────────────────────

describe('O.3: VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when no versions exist', async () => {
    // Mock the store to have a chartId
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.setState({ chartId: 'abc123456789' })

    // Mock fetch to return empty array
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )

    const { VersionHistoryPanel } = await import('../components/editor/VersionHistoryPanel')
    render(<VersionHistoryPanel />)

    await waitFor(() => {
      expect(screen.getByText('No versions yet')).toBeTruthy()
    })
  })

  it('renders version list with trigger badges', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.setState({ chartId: 'abc123456789' })

    const mockVersions = [
      { version: 2, created_at: new Date().toISOString(), trigger: 'publish', label: 'Published' },
      { version: 1, created_at: new Date().toISOString(), trigger: 'manual', label: 'First save' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVersions), { status: 200 })
    )

    const { VersionHistoryPanel } = await import('../components/editor/VersionHistoryPanel')
    render(<VersionHistoryPanel />)

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeTruthy()
      expect(screen.getByText('v1')).toBeTruthy()
      expect(screen.getByText('publish')).toBeTruthy()
      expect(screen.getByText('manual')).toBeTruthy()
      expect(screen.getByText('Published')).toBeTruthy()
      expect(screen.getByText('First save')).toBeTruthy()
    })
  })
})
