import { useEffect, useState } from 'react'
import { useCommentStore } from '../../stores/commentStore'
import { CommentThread } from './CommentThread'
import { CommentInput } from './CommentInput'

interface CommentSidebarProps {
  chartId: string | null
  dashboardId?: string | null
}

export function CommentSidebar({ chartId, dashboardId }: CommentSidebarProps) {
  const { comments, loading, fetchComments, addComment, deleteComment } = useCommentStore()
  const [replyTo, setReplyTo] = useState<string | null>(null)

  useEffect(() => {
    if (chartId || dashboardId) {
      fetchComments(chartId ?? undefined, dashboardId ?? undefined)
    }
  }, [chartId, dashboardId, fetchComments])

  const handleSubmit = (body: string) => {
    addComment(chartId, dashboardId ?? null, body, replyTo ?? undefined)
    setReplyTo(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-sm font-semibold text-text-primary">Comments</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-text-muted text-center py-4">Loading...</p>
        ) : (
          <CommentThread
            comments={comments}
            onReply={(id) => setReplyTo(id)}
            onDelete={deleteComment}
          />
        )}
      </div>
      <div className="px-4 py-3 border-t border-border-default">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-text-muted">Replying to comment</span>
            <button onClick={() => setReplyTo(null)} className="text-xs text-red-500 hover:text-red-400">Cancel</button>
          </div>
        )}
        <CommentInput onSubmit={handleSubmit} placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'} />
      </div>
    </div>
  )
}
