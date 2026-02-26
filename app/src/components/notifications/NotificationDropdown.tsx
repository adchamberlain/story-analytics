import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, type Notification } from '../../stores/notificationStore'

const ICON_MAP: Record<string, string> = {
  rocket: '\u{1F680}',
  upload: '\u{1F4C1}',
  chart: '\u{1F4CA}',
  dashboard: '\u{1F4CB}',
  palette: '\u{1F3A8}',
  key: '\u{1F511}',
  brain: '\u{1F9E0}',
  sparkles: '\u{2728}',
  types: '\u{1F4C8}',
  transform: '\u{1F504}',
  download: '\u{1F4E5}',
  share: '\u{1F517}',
  team: '\u{1F465}',
  globe: '\u{1F30D}',
}

interface NotificationDropdownProps {
  onClose: () => void
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const { notifications, loading, fetchNotifications, markRead, markAllRead } = useNotificationStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleClick = (notif: Notification) => {
    if (!notif.read_at) markRead(notif.id)
    const payload = notif.payload as Record<string, string>
    if (payload.action_url) {
      navigate(payload.action_url)
      onClose()
    }
  }

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
            <NotificationItem key={notif.id} notification={notif} onClick={handleClick} />
          ))
        )}
      </div>
    </div>
  )
}

function NotificationItem({ notification, onClick }: { notification: Notification; onClick: (n: Notification) => void }) {
  const isUnread = !notification.read_at
  const payload = notification.payload as Record<string, string>
  const message = payload.message || `${notification.type} notification`
  const timeAgo = formatTimeAgo(notification.created_at)
  const icon = payload.icon ? ICON_MAP[payload.icon] : null
  const hasAction = !!payload.action_url

  return (
    <button
      onClick={() => onClick(notification)}
      className={`w-full text-left px-4 py-3 border-b border-border-default hover:bg-surface-secondary transition-colors ${hasAction ? 'cursor-pointer' : ''} ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
    >
      <div className="flex items-start gap-2">
        {isUnread && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
        {icon && <span className="text-base mt-0.5 shrink-0">{icon}</span>}
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
