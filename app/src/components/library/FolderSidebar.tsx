import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useFolderStore, type Folder } from '../../stores/folderStore'
import { useLibraryStore } from '../../stores/libraryStore'

export function FolderSidebar() {
  const { folders, loadFolders, createFolder, renameFolder, deleteFolder } = useFolderStore()
  const { folderFilter, setFolderFilter, charts } = useLibraryStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await createFolder(newName.trim())
      setNewName('')
      setCreating(false)
    } catch {
      // Error handled by store
    }
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    try {
      await renameFolder(id, editName.trim())
      setEditingId(null)
    } catch {
      // Error handled by store
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteFolder(id)
      setConfirmDeleteId(null)
      if (folderFilter === id) setFolderFilter(null)
    } catch {
      // Error handled by store
    }
  }

  // Count charts per folder
  const folderCounts: Record<string, number> = {}
  let unfiledCount = 0
  for (const c of charts) {
    if (c.folder_id) {
      folderCounts[c.folder_id] = (folderCounts[c.folder_id] ?? 0) + 1
    } else {
      unfiledCount++
    }
  }

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 180 }}>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider px-2 mb-1">
        Folders
      </p>

      {/* All charts */}
      <button
        onClick={() => setFolderFilter(null)}
        className={`text-left text-[13px] rounded-lg transition-colors flex items-center justify-between px-2 py-1.5 ${
          folderFilter === null
            ? 'bg-blue-500/10 text-blue-600 font-medium'
            : 'text-text-secondary hover:bg-surface-secondary'
        }`}
      >
        All charts
        <span className="text-[11px] text-text-muted">{charts.length}</span>
      </button>

      {/* Unfiled — droppable target */}
      <DroppableUnfiled
        active={folderFilter === 'unfiled'}
        count={unfiledCount}
        onClick={() => setFolderFilter('unfiled')}
      />

      {/* Folder list */}
      {folders.map((folder) => (
        <DroppableFolderItem
          key={folder.id}
          folder={folder}
          count={folderCounts[folder.id] ?? 0}
          active={folderFilter === folder.id}
          editing={editingId === folder.id}
          confirmDelete={confirmDeleteId === folder.id}
          editName={editName}
          onClick={() => setFolderFilter(folder.id)}
          onStartEdit={() => {
            setEditingId(folder.id)
            setEditName(folder.name)
          }}
          onEditChange={setEditName}
          onEditSubmit={() => handleRename(folder.id)}
          onEditCancel={() => setEditingId(null)}
          onRequestDelete={() => setConfirmDeleteId(folder.id)}
          onConfirmDelete={() => handleDelete(folder.id)}
          onCancelDelete={() => setConfirmDeleteId(null)}
        />
      ))}

      {/* Create folder */}
      {creating ? (
        <div className="flex items-center gap-1 px-1 mt-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
            placeholder="Folder name"
            className="flex-1 px-2 py-1 text-[13px] border border-border-default rounded bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleCreate}
            className="text-[12px] text-blue-500 hover:text-blue-600 font-medium px-1"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-left text-[13px] text-text-muted hover:text-text-secondary px-2 py-1.5 transition-colors"
        >
          + New folder
        </button>
      )}
    </div>
  )
}

// ── Droppable Unfiled ───────────────────────────────────────────────────────

function DroppableUnfiled({ active, count, onClick }: { active: boolean; count: number; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'folder-unfiled',
    data: { folderId: null },
  })

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      data-testid="droppable-folder-unfiled"
      className={`text-left text-[13px] rounded-lg transition-colors flex items-center justify-between px-2 py-1.5 ${
        isOver
          ? 'bg-blue-500/20 border border-blue-400 text-blue-600 font-medium'
          : active
            ? 'bg-blue-500/10 text-blue-600 font-medium'
            : 'text-text-secondary hover:bg-surface-secondary'
      }`}
    >
      Unfiled
      <span className="text-[11px] text-text-muted">{count}</span>
    </button>
  )
}

// ── Droppable Folder Item ───────────────────────────────────────────────────

function DroppableFolderItem(props: {
  folder: Folder
  count: number
  active: boolean
  editing: boolean
  confirmDelete: boolean
  editName: string
  onClick: () => void
  onStartEdit: () => void
  onEditChange: (name: string) => void
  onEditSubmit: () => void
  onEditCancel: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${props.folder.id}`,
    data: { folderId: props.folder.id },
  })

  return (
    <div ref={setNodeRef} data-testid={`droppable-folder-${props.folder.id}`}>
      <FolderItem {...props} isOver={isOver} />
    </div>
  )
}

// ── Folder Item ─────────────────────────────────────────────────────────────

function FolderItem({
  folder,
  count,
  active,
  editing,
  confirmDelete,
  editName,
  onClick,
  onStartEdit,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  isOver = false,
}: {
  folder: Folder
  count: number
  active: boolean
  editing: boolean
  confirmDelete: boolean
  editName: string
  onClick: () => void
  onStartEdit: () => void
  onEditChange: (name: string) => void
  onEditSubmit: () => void
  onEditCancel: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  isOver?: boolean
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1">
        <input
          autoFocus
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSubmit()
            if (e.key === 'Escape') onEditCancel()
          }}
          className="flex-1 px-2 py-1 text-[13px] border border-border-default rounded bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={onEditSubmit} className="text-[12px] text-blue-500 px-1">Save</button>
      </div>
    )
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5 text-[12px]">
        <span className="text-red-400">Delete?</span>
        <button onClick={onConfirmDelete} className="text-red-500 font-medium px-1">Yes</button>
        <button onClick={onCancelDelete} className="text-text-muted px-1">No</button>
      </div>
    )
  }

  return (
    <div
      className={`group flex items-center justify-between rounded-lg transition-colors cursor-pointer px-2 py-1.5 ${
        isOver
          ? 'bg-blue-500/20 border border-blue-400 text-blue-600 font-medium'
          : active
            ? 'bg-blue-500/10 text-blue-600 font-medium'
            : 'text-text-secondary hover:bg-surface-secondary'
      }`}
    >
      <button onClick={onClick} className="text-left text-[13px] flex-1 truncate">
        {folder.name}
      </button>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-text-muted">{count}</span>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onStartEdit() }}
            className="text-[11px] text-text-muted hover:text-text-primary px-0.5"
            title="Rename"
          >
            ...
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete() }}
            className="text-[11px] text-red-400 hover:text-red-500 px-0.5"
            title="Delete"
          >
            x
          </button>
        </div>
      </div>
    </div>
  )
}
