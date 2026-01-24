import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ChartView from './pages/ChartView'
import DashboardView from './pages/DashboardView'
import ChatPage from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { VerifyPage } from './pages/VerifyPage'
import { ChartsPage } from './pages/ChartsPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

function App() {
  return (
    <Routes>
      {/* Public routes (no auth required) */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/verify" element={<VerifyPage />} />

      {/* Standalone chart/dashboard views (no sidebar, auth optional) */}
      <Route path="/chart/:chartId" element={<ChartView />} />
      <Route path="/dashboard/:slug" element={<DashboardView />} />

      {/* Protected app routes (with sidebar, auth required) */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/charts/new" element={<NewChartPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

// New Chart page - will redirect to chat with chart creation intent
function NewChartPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-gray-400)',
        padding: 'var(--space-6)',
      }}
    >
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          color: 'var(--color-primary)',
          marginBottom: 'var(--space-4)',
        }}
      >
        Create a New Chart
      </h1>
      <p style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
        Describe the chart you want to create, and AI will generate it for you.
      </p>
      <a
        href="/chat"
        style={{
          padding: 'var(--space-3) var(--space-6)',
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        Start in Chat
      </a>
    </div>
  )
}

export default App
