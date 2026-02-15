import { useNavigate } from 'react-router-dom'

interface OnboardingWizardProps {
  onDismiss: () => void
}

/**
 * First-run onboarding wizard shown when no dashboards exist.
 * Offers "Use Demo Data" (one-click) or "Connect Database" paths.
 */
export function OnboardingWizard({ onDismiss }: OnboardingWizardProps) {
  const navigate = useNavigate()

  const handleDemoData = () => {
    localStorage.setItem('onboarding_complete', 'true')
    // Navigate to source picker — demo CSV is available via file upload
    navigate('/sources')
  }

  const handleConnectDatabase = () => {
    localStorage.setItem('onboarding_complete', 'true')
    navigate('/sources')
  }

  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-text-primary mb-3">
          Welcome to Story Analytics
        </h1>
        <p className="text-base text-text-secondary max-w-lg mx-auto">
          Create publication-ready charts and dashboards from any data source.
          Get started by loading some data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Demo Data */}
        <button
          onClick={handleDemoData}
          className="group text-left p-6 rounded-xl border-2 border-border-default hover:border-blue-400 bg-surface hover:bg-blue-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            Upload a CSV
          </h3>
          <p className="text-xs text-text-secondary">
            Drop a CSV file to start exploring your data immediately. No account needed.
          </p>
        </button>

        {/* Connect Database */}
        <button
          onClick={handleConnectDatabase}
          className="group text-left p-6 rounded-xl border-2 border-border-default hover:border-emerald-400 bg-surface hover:bg-emerald-50 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            Connect a Database
          </h3>
          <p className="text-xs text-text-secondary">
            PostgreSQL, Snowflake, or BigQuery. Sync tables and start building charts.
          </p>
        </button>
      </div>

      <div className="text-center mt-8">
        <button
          onClick={onDismiss}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
