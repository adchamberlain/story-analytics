export function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-text-primary mb-6">Settings</h1>

      <div className="space-y-6">
        {/* App info */}
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-2">About</h2>
          <p className="text-sm text-text-secondary">
            Story Analytics v2.0
          </p>
          <p className="text-xs text-text-muted mt-1">
            Publication-ready dashboards from any data source.
          </p>
        </section>

        {/* Database connections placeholder */}
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-2">Database Connections</h2>
          <p className="text-sm text-text-muted">
            Coming soon. Connect to Snowflake, BigQuery, Postgres, and more.
          </p>
        </section>

        {/* Account placeholder */}
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-2">Account</h2>
          <p className="text-sm text-text-muted">
            Account management coming in a future release.
          </p>
        </section>
      </div>
    </div>
  )
}
