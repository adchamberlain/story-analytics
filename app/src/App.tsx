import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardsHome } from './pages/DashboardsHome'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { SourcesPage } from './pages/SourcesPage'
import { DashboardBuilderPage } from './pages/DashboardBuilderPage'
import { DashboardViewPage } from './pages/DashboardViewPage'
import { EditorPage } from './pages/EditorPage'
import { SourcePickerPage } from './pages/SourcePickerPage'
import { ChartViewPage } from './pages/ChartViewPage'
import { PublicChartPage } from './pages/PublicChartPage'
import { EmbedChartPage } from './pages/EmbedChartPage'
import { LoginPage } from './pages/LoginPage'
import { HomeRedirect } from './components/HomeRedirect'

function App() {
  return (
    <Routes>
      {/* Routes with top nav (AppShell) */}
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboards" element={<DashboardsHome />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/dashboard/new" element={<DashboardBuilderPage />} />
        <Route path="/dashboard/:dashboardId/edit" element={<DashboardBuilderPage />} />
      </Route>

      {/* Full-screen routes (own headers, no top nav) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard/:dashboardId" element={<DashboardViewPage />} />
      <Route path="/editor/new/source" element={<SourcePickerPage />} />
      <Route path="/editor/:chartId" element={<EditorPage />} />
      <Route path="/chart/:chartId" element={<ChartViewPage />} />
      <Route path="/public/chart/:chartId" element={<PublicChartPage />} />
      <Route path="/embed/chart/:chartId" element={<EmbedChartPage />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
