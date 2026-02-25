import { useEffect } from 'react'
import { useNotificationStore, type Notification } from '../../stores/notificationStore'

interface NotificationDropdownProps {
  onClose: () => void
}

export function NotificationDropdown({ onClose: _onClose }: NotificationDropdownProps) {
  const { notifications, loading, fetchNotifications, markRead, markAllRead } = useNotificationStore()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return (
    <div className="bg-surface-raised border border-border-default rounded-xl shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
        <button
          onClick={markAllRead}
          className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-text-muted text-center py-6">Loading...</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No notifications yet.</p>
        ) : (
          notifications.slice(0, 20).map((notif) => (
            <NotificationItem key={notif.id} notification={notif} onRead={markRead} />
          ))
        )}
      </div>
    </div>
  )
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const isUnread = !notification.read_at
  const payload = notification.payload as Record<string, string>
  const message = payload.message || `${notification.type} notification`
  const timeAgo = formatTimeAgo(notification.created_at)

  return (
    <button
      onClick={() => { if (isUnread) onRead(notification.id) }}
      className={`w-full text-left px-4 py-3 border-b border-border-default hover:bg-surface-secondary transition-colors ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
    >
      <div className="flex items-start gap-2">
        {isUnread && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isUnread ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{message}</p>
          <p className="text-xs text-text-muted mt-0.5">{timeAgo}</p>
        </div>
      </div>
    </button>
  )
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
