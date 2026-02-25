import type { Comment } from '../../stores/commentStore'

interface CommentThreadProps {
  comments: Comment[]
  onReply?: (parentId: string) => void
  onDelete?: (commentId: string) => void
}

export function CommentThread({ comments, onReply, onDelete }: CommentThreadProps) {
  // Build thread tree: top-level comments + replies
  const topLevel = comments.filter((c) => !c.parent_id)
  const repliesMap = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.parent_id) {
      const existing = repliesMap.get(c.parent_id) ?? []
      existing.push(c)
      repliesMap.set(c.parent_id, existing)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {topLevel.length === 0 && (
        <p className="text-sm text-text-muted py-4 text-center">No comments yet.</p>
      )}
      {topLevel.map((comment) => (
        <div key={comment.id}>
          <CommentBubble comment={comment} onReply={onReply} onDelete={onDelete} />
          {/* Replies */}
          {(repliesMap.get(comment.id) ?? []).map((reply) => (
            <div key={reply.id} className="ml-6 mt-2">
              <CommentBubble comment={reply} onReply={onReply} onDelete={onDelete} isReply />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function CommentBubble({ comment, onReply, onDelete, isReply = false }: { comment: Comment; onReply?: (id: string) => void; onDelete?: (id: string) => void; isReply?: boolean }) {
  const timeAgo = formatTimeAgo(comment.created_at)
  return (
    <div className={`rounded-lg border border-border-default p-3 ${isReply ? 'bg-surface-input' : 'bg-surface-raised'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-text-primary">{comment.author_name || 'User'}</span>
        <span className="text-xs text-text-muted">{timeAgo}</span>
        {comment.updated_at && <span className="text-xs text-text-muted">(edited)</span>}
      </div>
      <p className="text-sm text-text-secondary">{comment.body}</p>
      <div className="flex gap-3 mt-1.5">
        {onReply && !isReply && (
          <button onClick={() => onReply(comment.id)} className="text-xs text-text-muted hover:text-blue-500 transition-colors">
            Reply
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(comment.id)} className="text-xs text-text-muted hover:text-red-500 transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
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
