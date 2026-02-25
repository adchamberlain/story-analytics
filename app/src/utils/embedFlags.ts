/**
 * Embed render flags parsed from URL query parameters.
 *
 * Usage: append query parameters to embed URLs, e.g.:
 *   /embed/chart/abc?plain=true&static=true&transparent=true&logo=off&search=Europe
 */

export interface EmbedFlags {
  /** Hide title, subtitle, source, and footer chrome */
  plain: boolean
  /** Disable tooltips, hover, and zoom interactions */
  static: boolean
  /** Set background to transparent (for overlay embedding) */
  transparent: boolean
  /** Override theme logo visibility: true = show, false = hide, null = use theme default */
  logo: boolean | null
  /** Pre-fill search input for DataTable chart type */
  search: string
}

/**
 * Parse embed render flags from URL search parameters.
 *
 * - `plain=true` hides title, subtitle, source, and footer
 * - `static=true` disables tooltips, hover, and zoom
 * - `transparent=true` sets background to transparent
 * - `logo=on|off` overrides theme logo visibility (omit for theme default)
 * - `search=<text>` pre-fills DataTable search input
 */
export function parseEmbedFlags(params: URLSearchParams): EmbedFlags {
  return {
    plain: params.get('plain') === 'true',
    static: params.get('static') === 'true',
    transparent: params.get('transparent') === 'true',
    logo: params.has('logo') ? params.get('logo') === 'on' : null,
    search: params.get('search') || '',
  }
}
