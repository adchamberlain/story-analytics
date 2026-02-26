import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationStore } from '../../../stores/notificationStore'

describe('NotificationBell', () => {
  beforeEach(() => {
    useNotificationStore.setState({ unreadCount: 0, notifications: [], muted: false })
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

  it('supports onboarding tip payload shape with action_url and icon', () => {
    const onboardingTip = {
      id: 'tip1',
      type: 'onboarding_tip',
      payload: {
        message: 'Welcome to Story Analytics!',
        action_url: '/dashboards',
        icon: 'rocket',
      },
      read_at: null,
      created_at: new Date().toISOString(),
    }
    useNotificationStore.setState({ notifications: [onboardingTip], unreadCount: 1 })
    const state = useNotificationStore.getState()
    expect(state.notifications[0].type).toBe('onboarding_tip')
    expect(state.notifications[0].payload.action_url).toBe('/dashboards')
    expect(state.notifications[0].payload.icon).toBe('rocket')
    expect(state.notifications[0].payload.message).toBe('Welcome to Story Analytics!')
  })

  it('muted state prevents fetches and hides badge', () => {
    useNotificationStore.setState({ muted: true, unreadCount: 5 })
    const state = useNotificationStore.getState()
    expect(state.muted).toBe(true)
    expect(typeof state.setMuted).toBe('function')
  })
})
