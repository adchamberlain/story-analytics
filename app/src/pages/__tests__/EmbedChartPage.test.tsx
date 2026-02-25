/**
 * Tests for EmbedChartPage dark mode and embed render flags.
 *
 * Uses source-code inspection pattern consistent with the project's test style.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('EmbedChartPage dark mode', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../EmbedChartPage.tsx'),
      'utf-8',
    )
  })

  it('parses ?theme=dark query param', () => {
    // The component should read the theme query parameter
    expect(source).toContain("searchParams.get('theme')")
    // It should set isDark to true when theme=dark
    expect(source).toContain("if (themeParam === 'dark') return true")
  })

  it('parses ?theme=light query param', () => {
    // It should set isDark to false when theme=light
    expect(source).toContain("if (themeParam === 'light') return false")
  })

  it('defaults to auto (uses matchMedia)', () => {
    // When no theme param (auto), it should check system preference
    expect(source).toContain("window.matchMedia('(prefers-color-scheme: dark)').matches")
    // Default value for themeParam is 'auto'
    expect(source).toContain("|| 'auto'")
  })

  it('responds to sa-theme PostMessage', () => {
    // The component should listen for PostMessage events
    expect(source).toContain("event.data?.type === 'sa-theme'")
    expect(source).toContain("event.data.theme")
    // Should handle both dark and light themes
    expect(source).toContain("theme === 'dark'")
    expect(source).toContain("theme === 'light'")
  })

  it('listens for system theme changes in auto mode', () => {
    // Should add matchMedia change listener
    expect(source).toContain("mq.addEventListener('change', handler)")
    // Should clean up listener
    expect(source).toContain("mq.removeEventListener('change', handler)")
    // Should only listen in auto mode
    expect(source).toContain("if (themeParam !== 'auto') return")
  })

  it('applies dark background and text colors', () => {
    // Dark mode background (with transparent flag check)
    expect(source).toContain("isDark ? '#0f172a' : undefined")
    // Dark mode text colors for title, subtitle, source, staleness
    expect(source).toContain("isDark ? '#f1f5f9' : '#1a1a1a'")
    expect(source).toContain("isDark ? '#94a3b8' : '#666'")
    expect(source).toContain("isDark ? '#64748b' : '#999'")
    expect(source).toContain("isDark ? '#475569' : '#bbb'")
  })

  it('sets data-theme attribute on container', () => {
    expect(source).toContain("data-theme={isDark ? 'dark' : 'light'}")
  })
})

describe('EmbedChartPage embed flags', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../EmbedChartPage.tsx'),
      'utf-8',
    )
  })

  it('imports parseEmbedFlags utility', () => {
    expect(source).toContain("import { parseEmbedFlags } from '../utils/embedFlags'")
  })

  it('calls parseEmbedFlags with searchParams', () => {
    expect(source).toContain('parseEmbedFlags(searchParams)')
  })

  it('plain flag: hides title when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && chart.title')
  })

  it('plain flag: hides subtitle when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && chart.subtitle')
  })

  it('plain flag: hides source when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && chart.source')
  })

  it('plain flag: hides staleness indicator when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && displayAge')
  })

  it('plain flag: removes padding when plain=true', () => {
    expect(source).toContain("padding: flags.plain ? '0' : '12px 16px'")
  })

  it('transparent flag: sets background to transparent', () => {
    expect(source).toContain('flags.transparent')
    expect(source).toContain("? 'transparent'")
  })

  it('static flag: wraps chart in pointer-events:none div', () => {
    expect(source).toContain("flags.static ? { pointerEvents: 'none' } : undefined")
  })

  it('search flag: passes initialSearch via extraProps', () => {
    expect(source).toContain('initialSearch: flags.search')
  })
})

describe('EmbedDashboardPage dark mode', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../EmbedDashboardPage.tsx'),
      'utf-8',
    )
  })

  it('has useSearchParams import and theme detection', () => {
    expect(source).toContain('useSearchParams')
    expect(source).toContain("searchParams.get('theme')")
    expect(source).toContain("themeParam")
  })

  it('applies dark background and text colors', () => {
    // Dark mode background (with transparent flag check)
    expect(source).toContain("isDark ? '#0f172a' : undefined")
    expect(source).toContain("isDark ? '#f1f5f9' : '#1a1a1a'")
    expect(source).toContain("isDark ? '#94a3b8' : '#666'")
  })

  it('listens for PostMessage theme override', () => {
    expect(source).toContain("event.data?.type === 'sa-theme'")
  })

  it('sets data-theme attribute on container', () => {
    expect(source).toContain("data-theme={isDark ? 'dark' : 'light'}")
  })
})

describe('EmbedDashboardPage embed flags', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../EmbedDashboardPage.tsx'),
      'utf-8',
    )
  })

  it('imports parseEmbedFlags utility', () => {
    expect(source).toContain("import { parseEmbedFlags } from '../utils/embedFlags'")
  })

  it('calls parseEmbedFlags with searchParams', () => {
    expect(source).toContain('parseEmbedFlags(searchParams)')
  })

  it('plain flag: hides title when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && dashboard.title')
  })

  it('plain flag: hides description when flags.plain is true', () => {
    expect(source).toContain('!flags.plain && dashboard.description')
  })

  it('plain flag: removes padding when plain=true', () => {
    expect(source).toContain("padding: flags.plain ? '0' : '16px 24px'")
  })

  it('transparent flag: sets background to transparent', () => {
    expect(source).toContain('flags.transparent')
    expect(source).toContain("? 'transparent'")
  })

  it('static flag: wraps DashboardGrid in pointer-events:none div', () => {
    expect(source).toContain("flags.static ? { pointerEvents: 'none' } : undefined")
  })

  it('passes embedFlags to DashboardGrid', () => {
    expect(source).toContain('embedFlags={flags}')
  })
})

describe('DashboardGrid embed flags', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../../components/dashboard/DashboardGrid.tsx'),
      'utf-8',
    )
  })

  it('accepts embedFlags prop', () => {
    expect(source).toContain('embedFlags?: EmbedFlags')
  })

  it('passes embedFlags to DashboardChartCell', () => {
    expect(source).toContain('embedFlags={embedFlags}')
  })

  it('plain flag: hides title in ChartWrapper when plain is true', () => {
    expect(source).toContain('embedFlags?.plain ? undefined : (chart.title')
  })

  it('plain flag: hides subtitle in ChartWrapper when plain is true', () => {
    expect(source).toContain('embedFlags?.plain ? undefined : (chart.subtitle')
  })

  it('plain flag: hides source in ChartWrapper when plain is true', () => {
    expect(source).toContain('embedFlags?.plain ? undefined : (chart.source')
  })

  it('logo flag: passes hideLogo to ChartWrapper', () => {
    expect(source).toContain('hideLogo={showLogo === false}')
  })

  it('search flag: passes initialSearch via extraProps', () => {
    expect(source).toContain('initialSearch: embedFlags.search')
  })
})

describe('ChartWrapper hideLogo prop', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../../components/charts/ChartWrapper.tsx'),
      'utf-8',
    )
  })

  it('accepts hideLogo prop', () => {
    expect(source).toContain('hideLogo?: boolean')
  })

  it('hides logo when hideLogo is true', () => {
    expect(source).toContain('!hideLogo')
  })
})
