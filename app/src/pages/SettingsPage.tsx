export function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-text-primary mb-8">Settings</h1>

      <div className="space-y-6">
        {/* App info */}
        <section className="bg-surface-raised rounded-xl shadow-card border border-border-default p-6">
          <h2 className="text-base font-semibold text-text-primary mb-2">About</h2>
          <p className="text-sm text-text-secondary">
            Story Analytics v2.0
          </p>
          <p className="text-xs text-text-muted mt-1">
            Publication-ready dashboards from any data source.
          </p>
        </section>

        {/* Database connections placeholder */}
        <section className="bg-surface-raised rounded-xl shadow-card border border-border-default p-6">
          <h2 className="text-base font-semibold text-text-primary mb-2">Database Connections</h2>
          <p className="text-sm text-text-muted">
            Coming soon. Connect to Snowflake, BigQuery, Postgres, and more.
          </p>
        </section>

        {/* Account placeholder */}
        <section className="bg-surface-raised rounded-xl shadow-card border border-border-default p-6">
          <h2 className="text-base font-semibold text-text-primary mb-2">Account</h2>
          <p className="text-sm text-text-muted">
            Account management coming in a future release.
          </p>
        </section>
      </div>
    </div>
  )
}
