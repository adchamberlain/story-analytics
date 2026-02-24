import { describe, it, expect } from 'vitest'
import { CHART_THEMES } from '../chartThemes'

describe('CHART_THEMES', () => {
  const themeIds = Object.keys(CHART_THEMES)

  it('has 9 themes', () => {
    expect(themeIds).toHaveLength(9)
  })

  it('includes all expected theme IDs', () => {
    const expected = [
      'default', 'economist', 'minimal', 'nyt', 'nature',
      'fivethirtyeight', 'academic', 'dark', 'pastel',
    ]
    expect(themeIds).toEqual(expect.arrayContaining(expected))
  })

  for (const [id, theme] of Object.entries(CHART_THEMES)) {
    describe(`theme: ${id}`, () => {
      it('has matching id field', () => {
        expect(theme.id).toBe(id)
      })

      it('has name and description', () => {
        expect(theme.name.length).toBeGreaterThan(0)
        expect(theme.description.length).toBeGreaterThan(0)
      })

      it('has 8 palette colors', () => {
        expect(theme.palette.colors).toHaveLength(8)
      })

      it('palette colors are valid hex', () => {
        for (const color of theme.palette.colors) {
          expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
        }
      })

      it('primary is valid hex', () => {
        expect(theme.palette.primary).toMatch(/^#[0-9a-fA-F]{6}$/)
      })

      it('has font family', () => {
        expect(theme.font.family.length).toBeGreaterThan(0)
      })

      it('font sizes are positive', () => {
        expect(theme.font.title.size).toBeGreaterThan(0)
        expect(theme.font.subtitle.size).toBeGreaterThan(0)
        expect(theme.font.axis.size).toBeGreaterThan(0)
      })

      it('plot margins are non-negative', () => {
        expect(theme.plot.marginTop).toBeGreaterThanOrEqual(0)
        expect(theme.plot.marginRight).toBeGreaterThanOrEqual(0)
        expect(theme.plot.marginBottom).toBeGreaterThanOrEqual(0)
        expect(theme.plot.marginLeft).toBeGreaterThanOrEqual(0)
      })

      it('pie innerRadius is in [0, 1)', () => {
        expect(theme.pie.innerRadius).toBeGreaterThanOrEqual(0)
        expect(theme.pie.innerRadius).toBeLessThan(1)
      })

      it('pie labelStyle is valid', () => {
        expect(['external', 'internal']).toContain(theme.pie.labelStyle)
      })
    })
  }
})
