import { describe, it, expect } from 'vitest'
import { parseEmbedFlags } from '../embedFlags'

describe('parseEmbedFlags', () => {
  it('returns defaults when no params', () => {
    const flags = parseEmbedFlags(new URLSearchParams(''))
    expect(flags).toEqual({
      plain: false,
      static: false,
      transparent: false,
      logo: null,
      search: '',
    })
  })

  it('parses all flags set at once', () => {
    const flags = parseEmbedFlags(
      new URLSearchParams('plain=true&static=true&transparent=true&logo=off&search=Europe'),
    )
    expect(flags).toEqual({
      plain: true,
      static: true,
      transparent: true,
      logo: false,
      search: 'Europe',
    })
  })

  it('parses logo=on', () => {
    const flags = parseEmbedFlags(new URLSearchParams('logo=on'))
    expect(flags.logo).toBe(true)
  })

  it('parses logo=off', () => {
    const flags = parseEmbedFlags(new URLSearchParams('logo=off'))
    expect(flags.logo).toBe(false)
  })

  it('returns logo=null when logo param is absent', () => {
    const flags = parseEmbedFlags(new URLSearchParams('plain=true'))
    expect(flags.logo).toBeNull()
  })

  it('ignores invalid plain value (plain=yes)', () => {
    const flags = parseEmbedFlags(new URLSearchParams('plain=yes'))
    expect(flags.plain).toBe(false)
  })

  it('ignores invalid static value (static=1)', () => {
    const flags = parseEmbedFlags(new URLSearchParams('static=1'))
    expect(flags.static).toBe(false)
  })

  it('ignores invalid transparent value (transparent=yes)', () => {
    const flags = parseEmbedFlags(new URLSearchParams('transparent=yes'))
    expect(flags.transparent).toBe(false)
  })

  it('returns empty search when search param is absent', () => {
    const flags = parseEmbedFlags(new URLSearchParams('plain=true'))
    expect(flags.search).toBe('')
  })

  it('preserves search text with spaces and special characters', () => {
    const flags = parseEmbedFlags(new URLSearchParams('search=North+America'))
    expect(flags.search).toBe('North America')
  })

  it('handles URL-encoded search text', () => {
    const flags = parseEmbedFlags(new URLSearchParams('search=caf%C3%A9'))
    expect(flags.search).toBe('caf\u00e9')
  })

  it('handles each flag independently', () => {
    const plainOnly = parseEmbedFlags(new URLSearchParams('plain=true'))
    expect(plainOnly.plain).toBe(true)
    expect(plainOnly.static).toBe(false)
    expect(plainOnly.transparent).toBe(false)

    const staticOnly = parseEmbedFlags(new URLSearchParams('static=true'))
    expect(staticOnly.static).toBe(true)
    expect(staticOnly.plain).toBe(false)

    const transparentOnly = parseEmbedFlags(new URLSearchParams('transparent=true'))
    expect(transparentOnly.transparent).toBe(true)
    expect(transparentOnly.plain).toBe(false)
  })
})
