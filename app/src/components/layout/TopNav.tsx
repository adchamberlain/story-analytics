import { NavLink, Link } from 'react-router-dom'
import { LogoMark } from '../brand/Logo'
import { ThemeToggle } from './ThemeToggle'
import { NotificationBell } from '../notifications/NotificationBell'

export function TopNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-[15px] font-medium transition-colors ${
      isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-on-surface'
    }`

  return (
    <nav className="bg-surface border-b border-border-default shadow-sm flex items-center justify-between shrink-0" style={{ height: '72px', padding: '0 64px' }}>
      {/* Left: Logo + nav links */}
      <div className="flex items-center gap-10">
        <Link to="/dashboards" className="flex items-center gap-2.5 text-lg font-bold text-text-primary tracking-tight">
          <LogoMark className="h-6 w-6 text-blue-500" />
          Story Analytics
        </Link>

        <div className="flex items-center gap-8">
          <NavLink to="/dashboards" end className={linkClass}>
            Dashboards
          </NavLink>
          <NavLink to="/library" className={linkClass}>
            Library
          </NavLink>
          <NavLink to="/sources" className={linkClass}>
            Data
          </NavLink>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard/new"
          className="shrink-0 whitespace-nowrap text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          style={{ padding: '10px 20px' }}
        >
          + New Dashboard
        </Link>

        {/* Notifications */}
        <NotificationBell />

        {/* Theme toggle */}
        <ThemeToggle />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `p-2 rounded-lg transition-colors ${isActive ? 'text-text-primary bg-surface-inset' : 'text-text-icon hover:text-text-icon-hover hover:bg-surface-secondary'}`
          }
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </NavLink>
      </div>
    </nav>
  )
}
