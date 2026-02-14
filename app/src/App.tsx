import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import DashboardView from './pages/DashboardView'
import ChatPage from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { VerifyPage } from './pages/VerifyPage'
import { ChartsPage } from './pages/ChartsPage'
import { ChartEditPage } from './pages/ChartEditPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { NewDashboardPage } from './pages/NewDashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { PocPage } from './poc'
import { UploadPage } from './pages/UploadPage'
import { CreatePage } from './pages/CreatePage'
import { EditorPage } from './pages/EditorPage'
import { ChartViewPage } from './pages/ChartViewPage'
import { LibraryPage } from './pages/LibraryPage'
import { DashboardBuilderPage } from './pages/DashboardBuilderPage'
import { DashboardViewPage } from './pages/DashboardViewPage'

function App() {
  return (
    <Routes>
      {/* Public routes (no auth required) */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/verify" element={<VerifyPage />} />

      {/* Standalone chart/dashboard views (no sidebar, auth optional) */}
      <Route path="/chart/:chartId" element={<ChartViewPage />} />
      <Route path="/dashboard/:slug" element={<DashboardView />} />
      <Route path="/poc" element={<PocPage />} />
      <Route path="/create" element={<UploadPage />} />
      <Route path="/create/ai" element={<CreatePage />} />
      <Route path="/editor/:chartId" element={<EditorPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/dashboard/new" element={<DashboardBuilderPage />} />
      <Route path="/dashboard/:dashboardId/edit" element={<DashboardBuilderPage />} />
      <Route path="/dashboard/v2/:dashboardId" element={<DashboardViewPage />} />

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
        <Route path="/chart/:id/edit" element={<ChartEditPage />} />
        <Route path="/charts/new" element={<Navigate to="/chat" replace />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/new" element={<NewDashboardPage />} />
        <Route path="/dashboards/view/:slug" element={<DashboardView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
