import { useEffect, useState } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { NotificationDropdown } from './NotificationDropdown'

export function NotificationBell() {
  const { unreadCount, fetchUnreadCount } = useNotificationStore()
  const [open, setOpen] = useState(false)

  // Poll unread count every 60s
  useEffect(() => {
    fetchUnreadCount()
    const timer = setInterval(fetchUnreadCount, 60_000)
    return () => clearInterval(timer)
  }, [fetchUnreadCount])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg transition-colors text-text-icon hover:text-text-icon-hover hover:bg-surface-secondary relative"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 z-50">
            <NotificationDropdown onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
