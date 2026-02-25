import { describe, it, expect } from 'vitest'
import { useNotificationStore } from '../notificationStore'

describe('notificationStore', () => {
  it('initial unreadCount is 0', () => {
    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(0)
  })

  it('initial notifications is empty array', () => {
    const state = useNotificationStore.getState()
    expect(state.notifications).toEqual([])
  })
})
