/**
 * SkeletonBase component.
 * Base building block for skeleton loading states with shimmer animation.
 */

interface SkeletonBaseProps {
  /** Width (CSS value) */
  width?: string | number
  /** Height (CSS value) */
  height?: string | number
  /** Border radius (uses CSS variable if not specified) */
  borderRadius?: string
  /** Custom className */
  className?: string
  /** Custom inline styles */
  style?: React.CSSProperties
}

export function SkeletonBase({
  width = '100%',
  height = '1em',
  borderRadius,
  className = '',
  style = {},
}: SkeletonBaseProps) {
  const widthValue = typeof width === 'number' ? `${width}px` : width
  const heightValue = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: widthValue,
        height: heightValue,
        borderRadius: borderRadius || 'var(--radius-sm)',
        ...style,
      }}
      aria-hidden="true"
    />
  )
}

/**
 * SkeletonText - A line of skeleton text.
 */
interface SkeletonTextProps {
  /** Width as percentage or CSS value */
  width?: string | number
  /** Number of lines */
  lines?: number
  /** Gap between lines */
  gap?: string
  className?: string
}

export function SkeletonText({
  width = '100%',
  lines = 1,
  gap = 'var(--space-2)',
  className = '',
}: SkeletonTextProps) {
  if (lines === 1) {
    return <SkeletonBase width={width} height="1em" className={className} />
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap,
      }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          width={i === lines - 1 ? '70%' : width}
          height="1em"
        />
      ))}
    </div>
  )
}

/**
 * SkeletonCircle - A circular skeleton (for avatars, icons).
 */
interface SkeletonCircleProps {
  size?: number
  className?: string
}

export function SkeletonCircle({ size = 40, className = '' }: SkeletonCircleProps) {
  return (
    <SkeletonBase
      width={size}
      height={size}
      borderRadius="50%"
      className={className}
    />
  )
}
