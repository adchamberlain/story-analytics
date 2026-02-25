import { Component, type ReactNode } from 'react'

interface Props {
  chartTitle?: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary that catches rendering errors in individual chart components.
 * Prevents a single broken chart from crashing the entire dashboard.
 */
export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <div className="text-center">
            <p className="text-sm text-red-700 font-medium">
              {this.props.chartTitle ? `"${this.props.chartTitle}" failed to render` : 'Chart failed to render'}
            </p>
            <p className="text-xs text-red-500 mt-1 max-w-xs truncate">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
