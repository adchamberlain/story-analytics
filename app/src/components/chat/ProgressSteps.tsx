/**
 * ProgressSteps component.
 * Shows streaming progress during generation.
 */

import type { ProgressStep } from '../../types/conversation'

interface ProgressStepsProps {
  steps: ProgressStep[]
  isStreaming: boolean
  getStepLabel: (step: string) => string
}

export function ProgressSteps({ steps, isStreaming, getStepLabel }: ProgressStepsProps) {
  if (!isStreaming || steps.length === 0) {
    return null
  }

  return (
    <div
      className="fade-in"
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid var(--color-gray-700)',
        backgroundColor: 'var(--color-gray-800)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {steps.map((step, index) => (
          <StepItem key={index} step={step} label={getStepLabel(step.step)} />
        ))}
      </div>
    </div>
  )
}

interface StepItemProps {
  step: ProgressStep
  label: string
}

function StepItem({ step, label }: StepItemProps) {
  const statusStyles = getStatusStyles(step.status)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-sm)',
      }}
    >
      {/* Status indicator */}
      <StatusIcon status={step.status} />

      {/* Step label */}
      <span style={{ color: statusStyles.color, fontWeight: statusStyles.weight as number }}>
        {label}
      </span>

      {/* Details (if any) */}
      {step.details && (
        <span
          style={{
            color: 'var(--color-gray-400)',
            fontSize: 'var(--text-xs)',
            marginLeft: 'var(--space-1)',
          }}
        >
          - {step.details}
        </span>
      )}
    </div>
  )
}

interface StatusIconProps {
  status: ProgressStep['status']
}

function StatusIcon({ status }: StatusIconProps) {
  const size = 16

  if (status === 'pending') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-gray-400)"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }

  if (status === 'in_progress') {
    return (
      <div
        style={{
          width: size,
          height: size,
          border: '2px solid var(--color-primary)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
    )
  }

  if (status === 'completed') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-success)"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="16 10 11 15 8 12" />
      </svg>
    )
  }

  if (status === 'failed') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-error)"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    )
  }

  return null
}

function getStatusStyles(status: ProgressStep['status']) {
  switch (status) {
    case 'pending':
      return { color: 'var(--color-gray-400)', weight: 400 }
    case 'in_progress':
      return { color: 'var(--color-primary)', weight: 500 }
    case 'completed':
      return { color: 'var(--color-success)', weight: 400 }
    case 'failed':
      return { color: 'var(--color-error)', weight: 500 }
    default:
      return { color: 'var(--color-gray-500)', weight: 400 }
  }
}
