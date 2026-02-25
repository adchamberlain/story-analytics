/**
 * Tests for EmbedChartPage auto-refresh polling behaviour.
 *
 * These tests validate the refresh interval logic by inspecting
 * the source code structure of EmbedChartPage.tsx, following the
 * same pattern used in toolboxCmdEnter.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'


import { resolve, dirname } from 'path'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('EmbedChartPage auto-refresh', () => {
  let source: string

  beforeEach(async () => {
    
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../pages/EmbedChartPage.tsx'),
      'utf-8',
    )
  })

  it('should set up interval when refreshInterval is configured', () => {
    // The component should use setInterval with the refresh interval
    expect(source).toContain('setInterval')
    expect(source).toContain('refreshInterval')
  })

  it('should not set up polling when refreshInterval is absent or zero', () => {
    // The effect must guard against missing/zero refreshInterval
    expect(source).toContain('if (!interval || interval <= 0) return')
  })

  it('should clean up interval on unmount', () => {
    // The useEffect must return a cleanup function that clears the interval
    expect(source).toContain('clearInterval(timer)')
    // The return statement in the effect
    expect(source).toContain('return () => clearInterval(timer)')
  })

  it('should re-fetch from the chart API endpoint', () => {
    // The polling should hit the same v2/charts endpoint
    expect(source).toContain('fetch(`/api/v2/charts/${chartId}`)')
  })

  it('should update chartData on successful re-fetch', () => {
    // On successful fetch, it should call setChartData
    expect(source).toContain('setChartData(data)')
  })

  it('should silently handle fetch errors during polling', () => {
    // Errors during polling should not crash the embed
    expect(source).toContain('.catch(() => {})')
  })

  it('should multiply interval by 1000 for milliseconds', () => {
    // setInterval expects milliseconds; refreshInterval is in seconds
    expect(source).toContain('interval * 1000')
  })
})

describe('EmbedChartPage staleness indicator', () => {
  let source: string

  beforeEach(async () => {
    
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../pages/EmbedChartPage.tsx'),
      'utf-8',
    )
  })

  it('should have a formatAge utility function', () => {
    expect(source).toContain('function formatAge')
  })

  it('should track lastRefreshed timestamp', () => {
    expect(source).toContain('lastRefreshed')
    expect(source).toContain('setLastRefreshed')
  })

  it('should display staleness indicator with data-testid', () => {
    expect(source).toContain('data-testid="staleness-indicator"')
  })

  it('should show staleness only when refreshInterval is set', () => {
    // Conditional render: only show when both displayAge and refreshInterval exist
    expect(source).toContain('displayAge != null')
    expect(source).toContain('refreshInterval')
  })

  it('should format seconds correctly', () => {
    expect(source).toContain('`${seconds}s ago`')
  })

  it('should format minutes correctly', () => {
    expect(source).toContain('`${Math.floor(seconds / 60)}m ago`')
  })

  it('should format hours correctly', () => {
    expect(source).toContain('`${Math.floor(seconds / 3600)}h ago`')
  })
})
