import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardsHome } from './pages/DashboardsHome'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/v2/SettingsPage'
import { DashboardBuilderPage } from './pages/DashboardBuilderPage'
import { DashboardViewPage } from './pages/DashboardViewPage'
import { EditorPage } from './pages/EditorPage'
import { SourcePickerPage } from './pages/SourcePickerPage'
import { ChartViewPage } from './pages/ChartViewPage'

function App() {
  return (
    <Routes>
      {/* Routes with top nav (AppShell) */}
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardsHome />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/dashboard/new" element={<DashboardBuilderPage />} />
        <Route path="/dashboard/:dashboardId/edit" element={<DashboardBuilderPage />} />
      </Route>

      {/* Full-screen routes (own headers, no top nav) */}
      <Route path="/dashboard/:dashboardId" element={<DashboardViewPage />} />
      <Route path="/editor/new/source" element={<SourcePickerPage />} />
      <Route path="/editor/:chartId" element={<EditorPage />} />
      <Route path="/chart/:chartId" element={<ChartViewPage />} />

      {/* Redirects for old URLs */}
      <Route path="/create" element={<Navigate to="/" replace />} />
      <Route path="/create/ai" element={<Navigate to="/" replace />} />
      <Route path="/chat" element={<Navigate to="/" replace />} />
      <Route path="/dashboards" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/charts" element={<Navigate to="/library" replace />} />
      <Route path="/dashboard/v2/:id" element={<RedirectDashboardV2 />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Redirect /dashboard/v2/:id → /dashboard/:id */
function RedirectDashboardV2() {
  // useParams is only available inside a Route, so we parse from location
  const id = window.location.pathname.split('/dashboard/v2/')[1]
  return <Navigate to={`/dashboard/${id}`} replace />
}

export default App
