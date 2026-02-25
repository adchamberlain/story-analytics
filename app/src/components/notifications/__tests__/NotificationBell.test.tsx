import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationStore } from '../../../stores/notificationStore'

describe('NotificationBell', () => {
  beforeEach(() => {
    useNotificationStore.setState({ unreadCount: 0, notifications: [] })
  })

  it('store exposes unreadCount for badge rendering', () => {
    useNotificationStore.setState({ unreadCount: 5 })
    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(5)
  })

  it('store exposes fetchUnreadCount for polling', () => {
    const state = useNotificationStore.getState()
    expect(typeof state.fetchUnreadCount).toBe('function')
  })
})
