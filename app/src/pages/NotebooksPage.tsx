import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotebookStore } from '../stores/notebookStore'
import type { NotebookMeta } from '../stores/notebookStore'

export function NotebooksPage() {
  const navigate = useNavigate()
  const { notebooks, loadingList, fetchNotebooks, createNotebook, uploadNotebook, deleteNotebook } =
    useNotebookStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchNotebooks()
  }, [fetchNotebooks])

  const handleNew = async () => {
    setCreating(true)
    try {
      const id = await createNotebook('Untitled Notebook')
      navigate(`/notebook/${id}`)
    } catch {
      setCreating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const id = await uploadNotebook(file)
      navigate(`/notebook/${id}`)
    } catch {
      // TODO: show error toast
    }
    // Reset file input so same file can be uploaded again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (loadingList) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading notebooks...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '48px 64px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '40px' }}>
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Notebooks</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm rounded-xl border border-border-default text-text-primary hover:bg-surface-secondary transition-colors font-medium"
            style={{ padding: '10px 20px' }}
          >
            Upload .ipynb
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ipynb"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={handleNew}
            disabled={creating}
            className="text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            style={{ padding: '10px 20px' }}
          >
            {creating ? 'Creating...' : '+ New Notebook'}
          </button>
        </div>
      </div>

      {notebooks.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border-default rounded-xl">
          <svg
            className="mx-auto h-12 w-12 text-text-icon mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          <h2 className="text-base font-semibold text-text-primary mb-1">No notebooks yet</h2>
          <p className="text-sm text-text-secondary mb-5">
            Create a notebook to run Python and SQL interactively.
          </p>
          <button
            onClick={handleNew}
            disabled={creating}
            className="inline-flex items-center px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            + New Notebook
          </button>
        </div>
      ) : (
        <div
          className="grid gap-7"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
        >
          {notebooks.map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} onDelete={deleteNotebook} />
          ))}
        </div>
      )}
    </div>
  )
}

function NotebookCard({
  notebook,
  onDelete,
}: {
  notebook: NotebookMeta
  onDelete: (id: string) => Promise<void>
}) {
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const date = new Date(notebook.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete(notebook.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div
      onClick={() => navigate(`/notebook/${notebook.id}`)}
      className="group bg-surface-raised rounded-2xl border border-border-default shadow-card hover:shadow-card-hover flex flex-col transition-all hover:-translate-y-0.5 cursor-pointer relative"
      style={{ padding: '28px 32px' }}
    >
      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors ${
          confirmDelete
            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 opacity-100'
            : 'opacity-0 group-hover:opacity-100 text-text-icon hover:text-red-500 hover:bg-surface-secondary'
        }`}
        title={confirmDelete ? 'Click again to confirm delete' : 'Delete notebook'}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>

      <h3 className="text-[17px] font-semibold text-text-primary mb-2 line-clamp-2 leading-snug pr-8">
        {notebook.title || 'Untitled'}
      </h3>

      <div className="flex-1" />
      <div
        className="flex items-center justify-between"
        style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <span className="text-[13px] text-text-muted">
          {notebook.cell_count} cell{notebook.cell_count !== 1 ? 's' : ''}
        </span>
        <span className="text-[13px] text-text-muted">{date}</span>
      </div>
    </div>
  )
}
