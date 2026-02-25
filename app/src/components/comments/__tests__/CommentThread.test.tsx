import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentThread } from '../CommentThread'
import type { Comment } from '../../../stores/commentStore'

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    chart_id: 'chart-1',
    dashboard_id: null,
    parent_id: null,
    author_id: 'user-1',
    author_name: 'Test User',
    body: 'Test comment',
    created_at: new Date().toISOString(),
    updated_at: null,
    ...overrides,
  }
}

describe('CommentThread', () => {
  it('renders "No comments yet" when empty', () => {
    render(<CommentThread comments={[]} />)
    expect(screen.getByText('No comments yet.')).toBeDefined()
  })

  it('renders top-level comments', () => {
    const comments = [
      makeComment({ id: 'c1', body: 'First comment' }),
      makeComment({ id: 'c2', body: 'Second comment' }),
    ]
    render(<CommentThread comments={comments} />)
    expect(screen.getByText('First comment')).toBeDefined()
    expect(screen.getByText('Second comment')).toBeDefined()
  })

  it('renders threaded replies indented', () => {
    const comments = [
      makeComment({ id: 'c1', body: 'Parent' }),
      makeComment({ id: 'c2', body: 'Reply', parent_id: 'c1' }),
    ]
    const { container } = render(<CommentThread comments={comments} />)
    expect(screen.getByText('Parent')).toBeDefined()
    expect(screen.getByText('Reply')).toBeDefined()
    // Reply should be in a div with ml-6 class (indented)
    const replyContainer = container.querySelector('.ml-6')
    expect(replyContainer).not.toBeNull()
  })

  it('Reply button calls onReply', () => {
    const onReply = vi.fn()
    const comments = [makeComment({ id: 'c1', body: 'Replyable' })]
    render(<CommentThread comments={comments} onReply={onReply} />)
    fireEvent.click(screen.getByText('Reply'))
    expect(onReply).toHaveBeenCalledWith('c1')
  })

  it('Delete button calls onDelete', () => {
    const onDelete = vi.fn()
    const comments = [makeComment({ id: 'c1', body: 'Deleteable' })]
    render(<CommentThread comments={comments} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith('c1')
  })
})
