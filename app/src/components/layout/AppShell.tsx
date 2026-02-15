import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-secondary">
      <TopNav />
      <Outlet />
    </div>
  )
}
