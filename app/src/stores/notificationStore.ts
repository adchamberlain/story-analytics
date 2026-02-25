import { create } from 'zustand'
import { authFetch } from '../utils/authFetch'

export interface Notification {
  id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  fetchUnreadCount: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true })
    try {
      const res = await authFetch('/api/notifications/')
      if (res.ok) {
        const data = await res.json()
        set({ notifications: data, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  fetchUnreadCount: async () => {
    try {
      const res = await authFetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        set({ unreadCount: data.count })
      }
    } catch { /* silent */ }
  },

  markRead: async (id) => {
    await authFetch(`/api/notifications/${id}/read`, { method: 'PUT' })
    set({ notifications: get().notifications.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n) })
    get().fetchUnreadCount()
  },

  markAllRead: async () => {
    await authFetch('/api/notifications/read-all', { method: 'PUT' })
    set({ notifications: get().notifications.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })), unreadCount: 0 })
  },
}))
