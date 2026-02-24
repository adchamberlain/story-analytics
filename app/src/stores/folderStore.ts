import { create } from 'zustand'

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

interface FolderState {
  folders: Folder[]
  loading: boolean
  error: string | null

  loadFolders: () => Promise<void>
  createFolder: (name: string, parentId?: string) => Promise<Folder>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  loading: false,
  error: null,

  loadFolders: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/folders/')
      if (!res.ok) throw new Error(`Failed to load folders: ${res.statusText}`)
      const folders: Folder[] = await res.json()
      set({ folders, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  createFolder: async (name, parentId) => {
    const res = await fetch('/api/folders/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId }),
    })
    if (!res.ok) throw new Error('Failed to create folder')
    const folder: Folder = await res.json()
    set((state) => ({ folders: [folder, ...state.folders] }))
    return folder
  },

  renameFolder: async (id, name) => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('Failed to rename folder')
    const updated: Folder = await res.json()
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? updated : f)),
    }))
  },

  deleteFolder: async (id) => {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete folder')
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }))
  },
}))
