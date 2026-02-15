/**
 * Story Analytics logo — two vertical rounded bars.
 * Uses currentColor so it adapts to light/dark mode via the parent's text color.
 */
export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className}>
      <rect x="4" y="5" width="10" height="22" rx="3" />
      <rect x="18" y="5" width="10" height="22" rx="3" />
    </svg>
  )
}
