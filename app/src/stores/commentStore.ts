import { create } from 'zustand'

export interface Comment {
  id: string
  chart_id: string | null
  dashboard_id: string | null
  parent_id: string | null
  author_id: string
  author_name: string | null
  body: string
  created_at: string
  updated_at: string | null
}

interface CommentState {
  comments: Comment[]
  loading: boolean
  error: string | null
  fetchComments: (chartId?: string, dashboardId?: string) => Promise<void>
  addComment: (chartId: string | null, dashboardId: string | null, body: string, parentId?: string) => Promise<void>
  deleteComment: (commentId: string) => Promise<void>
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  loading: false,
  error: null,

  fetchComments: async (chartId, dashboardId) => {
    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (chartId) params.set('chart_id', chartId)
      if (dashboardId) params.set('dashboard_id', dashboardId)
      const res = await fetch(`/api/comments/?${params}`)
      if (!res.ok) throw new Error('Failed to fetch comments')
      const data = await res.json()
      set({ comments: data, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  addComment: async (chartId, dashboardId, body, parentId) => {
    try {
      const res = await fetch('/api/comments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_id: chartId, dashboard_id: dashboardId, body, parent_id: parentId ?? null }),
      })
      if (!res.ok) throw new Error('Failed to add comment')
      // Refresh comments
      get().fetchComments(chartId ?? undefined, dashboardId ?? undefined)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  deleteComment: async (commentId) => {
    try {
      await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
      set({ comments: get().comments.filter((c) => c.id !== commentId) })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
}))
