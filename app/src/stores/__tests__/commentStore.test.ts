import { describe, it, expect } from 'vitest'
import { useCommentStore } from '../commentStore'

describe('commentStore', () => {
  it('initial state has empty comments', () => {
    const state = useCommentStore.getState()
    expect(state.comments).toEqual([])
  })

  it('initial state has loading false', () => {
    const state = useCommentStore.getState()
    expect(state.loading).toBe(false)
  })
})
