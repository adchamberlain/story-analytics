/**
 * Home page - landing page for the React app.
 * Future: This will be the main chat interface.
 */

export default function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 600,
        color: 'var(--color-gray-900)',
        marginBottom: '1rem',
      }}>
        Story Analytics
      </h1>
      <p style={{
        color: 'var(--color-gray-600)',
        maxWidth: '500px',
        marginBottom: '2rem',
      }}>
        React + Plotly.js Dashboard Renderer
      </p>
      <div style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <a
          href="/chart/test"
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--color-primary)',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Test Chart View
        </a>
        <a
          href="/dashboard/test"
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--color-gray-200)',
            color: 'var(--color-gray-800)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Test Dashboard View
        </a>
      </div>
    </div>
  )
}
