// In-place mutations of a WorkspaceManifest snapshot, mirroring the tree store's
// local helpers. Used by CloudBackend inside mutateManifest().

import type { WorkspaceManifest, TrashedItem } from '../../../types/workspace'
import type { FolderMeta, NoteMeta } from '../../../types/note'

export function findFolder(tree: FolderMeta[], id: string): FolderMeta | null {
  for (const f of tree) {
    if (f.id === id) return f
    const found = findFolder(f.children, id)
    if (found) return found
  }
  return null
}

export function addFolder(m: WorkspaceManifest, parentId: string | null, title: string, icon: string): FolderMeta {
  const folder: FolderMeta = {
    id: crypto.randomUUID(), title, icon, parentId, order: 0, children: [], notes: [],
  }
  if (parentId) findFolder(m.tree, parentId)?.children.push(folder)
  else { m.tree.push(folder); m.rootOrder.push(folder.id) }
  return folder
}

export function renameFolder(m: WorkspaceManifest, folderId: string, title: string): void {
  const f = findFolder(m.tree, folderId)
  if (f) f.title = title
}

export function removeFolder(m: WorkspaceManifest, folderId: string): void {
  const strip = (tree: FolderMeta[]): boolean => {
    const idx = tree.findIndex(f => f.id === folderId)
    if (idx !== -1) { tree.splice(idx, 1); return true }
    return tree.some(f => strip(f.children))
  }
  strip(m.tree)
  m.rootOrder = m.rootOrder.filter(id => id !== folderId)
}

export function addNote(m: WorkspaceManifest, id: string, folderId: string | null, title: string, icon: string): NoteMeta {
  const meta: NoteMeta = { id, title, icon, folderId, updatedAt: new Date().toISOString() }
  if (folderId) findFolder(m.tree, folderId)?.notes.push(meta)
  else { m.rootNotes.push(meta); m.rootOrder.push(id) }
  return meta
}

export function findNote(m: WorkspaceManifest, noteId: string): NoteMeta | null {
  const root = m.rootNotes.find(n => n.id === noteId)
  if (root) return root
  const walk = (tree: FolderMeta[]): NoteMeta | null => {
    for (const f of tree) {
      const n = f.notes.find(x => x.id === noteId)
      if (n) return n
      const found = walk(f.children)
      if (found) return found
    }
    return null
  }
  return walk(m.tree)
}

export function updateNoteMeta(m: WorkspaceManifest, noteId: string, updates: Partial<Pick<NoteMeta, 'title' | 'icon'>>): void {
  const n = findNote(m, noteId)
  if (!n) return
  if (typeof updates.title === 'string') n.title = updates.title
  if (typeof updates.icon === 'string') n.icon = updates.icon
  n.updatedAt = new Date().toISOString()
}

/** Extract a note meta out of the tree/root, returning it (or null). */
export function extractNote(m: WorkspaceManifest, noteId: string): NoteMeta | null {
  const rootIdx = m.rootNotes.findIndex(n => n.id === noteId)
  if (rootIdx !== -1) {
    const [meta] = m.rootNotes.splice(rootIdx, 1)
    m.rootOrder = m.rootOrder.filter(id => id !== noteId)
    return meta
  }
  const walk = (tree: FolderMeta[]): NoteMeta | null => {
    for (const f of tree) {
      const idx = f.notes.findIndex(n => n.id === noteId)
      if (idx !== -1) return f.notes.splice(idx, 1)[0]
      const found = walk(f.children)
      if (found) return found
    }
    return null
  }
  return walk(m.tree)
}

export function moveNote(m: WorkspaceManifest, noteId: string, targetFolderId: string | null): void {
  const meta = extractNote(m, noteId)
  if (!meta) return
  meta.folderId = targetFolderId
  if (targetFolderId) findFolder(m.tree, targetFolderId)?.notes.push(meta)
  else { m.rootNotes.push(meta); m.rootOrder.push(noteId) }
}

export function trashNote(m: WorkspaceManifest, noteId: string): void {
  const meta = findNote(m, noteId)
  extractNote(m, noteId)
  if (meta) {
    m.trash ??= []
    m.trash.push({
      id: meta.id, type: 'note', title: meta.title,
      deletedAt: new Date().toISOString(), originalParentId: meta.folderId,
    } as TrashedItem)
  }
}

export function restoreTrash(m: WorkspaceManifest, itemId: string): void {
  m.trash ??= []
  const idx = m.trash.findIndex(i => i.id === itemId)
  if (idx === -1) return
  const item = m.trash.splice(idx, 1)[0]
  addNote(m, item.id, item.originalParentId ?? null, item.title, '📄')
}
