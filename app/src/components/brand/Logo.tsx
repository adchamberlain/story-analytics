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
          color: 'var(--color-primary)',
          fontWeight: 700,
          fontSize: s.fontSize,
          letterSpacing: '0.1em',
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
            marginLeft: '6px',
            animation: 'blink 1s step-end infinite',
          }}
        >
          {/* First cursor (analyst) */}
          <span
            style={{
              display: 'inline-block',
              width: s.cursorWidth,
              height: s.cursorHeight,
              backgroundColor: 'var(--color-primary)',
            }}
          />
          {/* Second cursor (AI) */}
          <span
            style={{
              display: 'inline-block',
              width: s.cursorWidth,
              height: s.cursorHeight,
              backgroundColor: 'var(--color-primary)',
            }}
          />
        </span>
      </h1>
      {showTagline && (
        <p
          style={{
            color: dark ? 'var(--color-gray-400)' : 'var(--color-gray-500)',
            fontSize: s.taglineSize,
            marginTop: 'var(--space-1)',
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
