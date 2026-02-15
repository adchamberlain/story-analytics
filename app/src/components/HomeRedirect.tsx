import { Navigate } from 'react-router-dom'

/**
 * Redirects `/` to the pinned dashboard if one exists, otherwise to `/dashboards`.
 */
export function HomeRedirect() {
  const pinnedId = localStorage.getItem('pinnedDashboardId')

  if (pinnedId) {
    return <Navigate to={`/dashboard/${pinnedId}`} replace />
  }

  return <Navigate to="/dashboards" replace />
}
