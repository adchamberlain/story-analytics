/**
 * Story Logo with dual blinking cursors.
 *
 * The two cursors represent the analyst and AI working together.
 */

interface LogoProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Show the tagline below the logo */
  showTagline?: boolean
  /** Dark mode (for dark backgrounds) */
  dark?: boolean
}

const SIZES = {
  sm: {
    fontSize: 'var(--text-lg)',
    cursorWidth: '6px',
    cursorHeight: '16px',
    cursorGap: '2px',
    taglineSize: 'var(--text-xs)',
  },
  md: {
    fontSize: 'var(--text-xl)',
    cursorWidth: '8px',
    cursorHeight: '20px',
    cursorGap: '3px',
    taglineSize: 'var(--text-xs)',
  },
  lg: {
    fontSize: 'var(--text-2xl)',
    cursorWidth: '10px',
    cursorHeight: '24px',
    cursorGap: '4px',
    taglineSize: 'var(--text-sm)',
  },
}

export function Logo({ size = 'md', showTagline = true, dark = false }: LogoProps) {
  const s = SIZES[size]

  return (
    <div>
      <h1
        style={{
          color: 'var(--color-brand)',
          fontWeight: 700,
          fontSize: s.fontSize,
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.3em',
          textShadow: '0 0 20px var(--color-brand-glow), 0 0 40px var(--color-brand-glow)',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        STORY
        {/* Dual cursors - analyst + AI working together */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: s.cursorGap,
            marginLeft: '0.15em',
            animation: 'blink 1s step-end infinite',
          }}
        >
          {/* First cursor (analyst) */}
          <span
            style={{
              display: 'inline-block',
              width: s.cursorWidth,
              height: s.cursorHeight,
              backgroundColor: 'var(--color-brand)',
              boxShadow: '0 0 10px var(--color-brand-glow)',
            }}
          />
          {/* Second cursor (AI) */}
          <span
            style={{
              display: 'inline-block',
              width: s.cursorWidth,
              height: s.cursorHeight,
              backgroundColor: 'var(--color-brand)',
              boxShadow: '0 0 10px var(--color-brand-glow)',
            }}
          />
        </span>
      </h1>
      {showTagline && (
        <p
          style={{
            color: dark ? 'var(--color-brand-dim)' : 'var(--color-brand)',
            fontFamily: 'var(--font-brand)',
            fontSize: s.taglineSize,
            opacity: dark ? 0.7 : 0.9,
            margin: 0,
            marginTop: '4px',
          }}
        >
          AI-native analytics.
        </p>
      )}
    </div>
  )
}
