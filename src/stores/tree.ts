import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { FolderMeta, NoteMeta, TreeNode } from '../types/note'
import type { TemplateFieldValues } from '../types/template'
import { useWorkspaceStore } from './workspace'
import { moveItemInArray } from '../utils/sidebar/reorder'

export const useTreeStore = defineStore('tree', () => {
  const workspaceStore = useWorkspaceStore()

  const folderById = computed<Map<string, FolderMeta>>(() => {
    const map = new Map<string, FolderMeta>()
    const manifest = workspaceStore.manifest
    if (!manifest) return map
    function walk(folders: FolderMeta[]) {
      for (const f of folders) {
        map.set(f.id, f)
        walk(f.children)
      }
    }
    walk(manifest.tree)
    return map
  })

  const noteById = computed<Map<string, NoteMeta>>(() => {
    const map = new Map<string, NoteMeta>()
    const manifest = workspaceStore.manifest
    if (!manifest) return map
    for (const n of manifest.rootNotes) map.set(n.id, n)
    function walk(folders: FolderMeta[]) {
      for (const f of folders) {
        for (const n of f.notes) map.set(n.id, n)
        walk(f.children)
      }
    }
    walk(manifest.tree)
    return map
  })

  const tree = computed<TreeNode[]>(() => {
    const manifest = workspaceStore.manifest
    if (!manifest) return []
    // Resolve each root id via the prebuilt maps (O(1)) instead of scanning the
    // root folder/note arrays for every entry (was O(rootOrder × roots)).
    const folders = folderById.value
    const notes = noteById.value
    const nodes: TreeNode[] = []
    for (const id of manifest.rootOrder) {
      const folder = folders.get(id)
      if (folder) {
        nodes.push({ kind: 'folder', meta: folder })
        continue
      }
      const note = notes.get(id)
      if (note) nodes.push({ kind: 'note', meta: note })
    }
    return nodes
  })

  async function createFolder(parentId: string | null, title: string, icon = '📁') {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return
    const folder = await backend.createFolder(parentId, title, icon)
    if (parentId) {
      folderById.value.get(parentId)?.children.push(folder)
    } else {
      workspaceStore.manifest.tree.push(folder)
      workspaceStore.manifest.rootOrder.push(folder.id)
    }
  }

  async function renameFolder(folderId: string, title: string) {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return
    await backend.renameFolder(folderId, title)
    const folder = folderById.value.get(folderId)
    if (folder) folder.title = title
  }

  async function deleteFolder(folderId: string, recursive = false) {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return
    await backend.deleteFolder(folderId, recursive)
    _removeFolderFromTree(workspaceStore.manifest.tree, folderId)
    workspaceStore.manifest.rootOrder = workspaceStore.manifest.rootOrder.filter(id => id !== folderId)
  }

  async function createNote(folderId: string | null, title = 'Untitled', icon = '📄') {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return null
    const note = await backend.createNote(folderId, title, icon)
    const meta: NoteMeta = { id: note.id, title: note.title, icon: note.icon, folderId, updatedAt: note.updatedAt }
    if (folderId) {
      folderById.value.get(folderId)?.notes.push(meta)
    } else {
      workspaceStore.manifest.rootNotes.push(meta)
      workspaceStore.manifest.rootOrder.push(note.id)
    }
    void workspaceStore.refreshSidebarNotePreviews()
    return note
  }

  async function createNoteFromTemplate(templateId: string, folderId: string | null, title = 'Untitled', icon = '📄', fieldValues: TemplateFieldValues = {}) {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return null
    const note = await backend.createNoteFromTemplate(templateId, folderId, title, icon, fieldValues)
    const meta: NoteMeta = { id: note.id, title: note.title, icon: note.icon, folderId, updatedAt: note.updatedAt }
    if (folderId) {
      folderById.value.get(folderId)?.notes.push(meta)
    } else {
      workspaceStore.manifest.rootNotes.push(meta)
      workspaceStore.manifest.rootOrder.push(note.id)
    }
    void workspaceStore.refreshSidebarNotePreviews()
    return note
  }

  async function renameNote(noteId: string, title: string) {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return
    const note = await backend.loadNote(noteId)
    const updatedAt = new Date().toISOString()
    await backend.saveNote({ ...note, title, updatedAt })
    syncNoteMeta(noteId, { title }, updatedAt)
    void workspaceStore.refreshSidebarNotePreviews()
  }

  function syncNoteMeta(noteId: string, updates: Partial<Pick<NoteMeta, 'title' | 'icon'>>, updatedAt?: string) {
    const manifest = workspaceStore.manifest
    if (!manifest) return
    const root = manifest.rootNotes.find(n => n.id === noteId)
    if (root) {
      if (typeof updates.title === 'string') root.title = updates.title
      if (typeof updates.icon === 'string') root.icon = updates.icon
      if (updatedAt) root.updatedAt = updatedAt
      return
    }
    _updateNoteInTree(manifest.tree, noteId, updates, updatedAt)
  }

  async function deleteNote(noteId: string) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return

    // Find note meta to move to trash in local state
    const noteMeta = manifest.rootNotes.find(n => n.id === noteId) || _findNoteInTree(manifest.tree, noteId)

    await backend.deleteNote(noteId)
    
    if (noteMeta) {
      manifest.trash ??= []
      manifest.trash.push({
        id: noteMeta.id,
        type: 'note',
        title: noteMeta.title,
        deletedAt: new Date().toISOString(),
        originalParentId: noteMeta.folderId,
        icon: noteMeta.icon
      })
    }

    manifest.rootNotes = manifest.rootNotes.filter(n => n.id !== noteId)
    manifest.rootOrder = manifest.rootOrder.filter(id => id !== noteId)
    _removeNoteFromTree(manifest.tree, noteId)
    void workspaceStore.refreshSidebarNotePreviews()
  }

  async function moveNote(noteId: string, targetFolderId: string | null) {
    const backend = workspaceStore.backend
    if (!backend || !workspaceStore.manifest) return
    await backend.moveNote(noteId, targetFolderId)
    const meta = _extractNote(workspaceStore.manifest, noteId)
    if (!meta) return
    meta.folderId = targetFolderId
    if (targetFolderId) {
      folderById.value.get(targetFolderId)?.notes.push(meta)
    } else {
      workspaceStore.manifest.rootNotes.push(meta)
      workspaceStore.manifest.rootOrder.push(noteId)
    }
    void workspaceStore.refreshSidebarNotePreviews()
  }

  async function moveNoteToPosition(
    noteId: string,
    targetId: string,
    position: 'before' | 'after',
    targetParentId: string | null,
  ) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest || noteId === targetId) return

    if (targetParentId === null) {
      if (!manifest.rootOrder.includes(targetId)) return
    } else {
      const targetFolder = folderById.value.get(targetParentId)
      if (!targetFolder?.notes.some((n) => n.id === targetId)) return
    }

    await backend.moveNote(noteId, targetParentId)
    const meta = _extractNote(manifest, noteId)
    if (!meta) return
    meta.folderId = targetParentId

    if (targetParentId === null) {
      const targetIdx = manifest.rootOrder.indexOf(targetId)
      const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx
      manifest.rootNotes.push(meta)
      manifest.rootOrder.splice(insertIdx, 0, noteId)
    } else {
      const folder = folderById.value.get(targetParentId)
      if (!folder) return
      const targetIdx = folder.notes.findIndex((n) => n.id === targetId)
      const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx
      folder.notes.splice(insertIdx, 0, meta)
    }

    await backend.saveManifest(manifest)
    void workspaceStore.refreshSidebarNotePreviews()
  }

  /** Переупорядочивает элемент (заметку или папку) внутри одного уровня дерева.
   *  `targetParentId === null` — корневой уровень (мутируется `rootOrder`);
   *  иначе переупорядочивание внутри массивов `folder.notes`/`folder.children`.
   *  `targetId` — элемент-ориентир, относительно которого вставлен перетаскиваемый;
   *  `position` — 'before' или 'after'. Не работает для вложения (используйте moveNote). */
  async function reorderItem(
    itemId: string,
    targetId: string,
    position: 'before' | 'after',
    targetParentId: string | null,
  ) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return

    if (targetParentId === null) {
      const fromIdx = manifest.rootOrder.indexOf(itemId)
      const targetIdx = manifest.rootOrder.indexOf(targetId)
      if (fromIdx === -1 || targetIdx === -1 || fromIdx === targetIdx) return
      const adjustedTarget = position === 'after' ? targetIdx + 1 : targetIdx
      manifest.rootOrder = moveItemInArray(
        manifest.rootOrder.map((id) => ({ id })),
        itemId,
        adjustedTarget,
      ).map((entry) => entry.id)
    } else {
      const folder = folderById.value.get(targetParentId)
      if (!folder) return
      const container = folder.notes as NoteMeta[]
      const fromIdx = container.findIndex((n) => n.id === itemId)
      const targetIdx = container.findIndex((n) => n.id === targetId)
      if (fromIdx === -1 || targetIdx === -1 || fromIdx === targetIdx) return
      const adjustedTarget = position === 'after' ? targetIdx + 1 : targetIdx
      const reordered = moveItemInArray(container, itemId, adjustedTarget)
      folder.notes.splice(0, folder.notes.length, ...reordered)
    }
    await backend.saveManifest(manifest)
  }

  /** Сохраняет пользовательский порядок заметок для режима tag-preview. */
  async function setSidebarNoteOrder(order: string[]) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return
    manifest.sidebarNoteOrder = order
    await backend.saveManifest(manifest)
  }

  async function restoreFromTrash(itemId: string) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return
    await backend.restoreFromTrash(itemId)
    
    manifest.trash ??= []
    const trashIdx = manifest.trash.findIndex(i => i.id === itemId)
    if (trashIdx !== -1) {
      const item = manifest.trash.splice(trashIdx, 1)[0]
      const meta: NoteMeta = {
        id: item.id,
        title: item.title,
        icon: item.icon ?? '📄',
        folderId: item.originalParentId,
        updatedAt: new Date().toISOString()
      }
      
      if (meta.folderId && folderById.value.has(meta.folderId)) {
        folderById.value.get(meta.folderId)?.notes.push(meta)
      } else {
        manifest.rootNotes.push(meta)
        manifest.rootOrder.push(itemId)
      }
    }
  }

  async function permanentlyDeleteFromTrash(itemId: string) {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return
    await backend.permanentlyDeleteFromTrash(itemId)
    manifest.trash = (manifest.trash ?? []).filter(i => i.id !== itemId)
  }

  async function emptyTrash() {
    const backend = workspaceStore.backend
    const manifest = workspaceStore.manifest
    if (!backend || !manifest) return
    await backend.emptyTrash()
    manifest.trash = []
  }

  /** Resolve a note id by its title (case-insensitive, trimmed, exact match).
   *  Used by wiki-link `[[Title]]` resolution for both the link picker and the
   *  Markdown importer. Returns null when no note matches. */
  function resolveNoteIdByTitle(title: string): string | null {
    const normalized = title.trim().toLowerCase()
    if (!normalized) return null
    for (const meta of noteById.value.values()) {
      if (meta.title.trim().toLowerCase() === normalized) return meta.id
    }
    return null
  }

  return { tree, folderById, noteById, resolveNoteIdByTitle, createFolder, renameFolder, deleteFolder, createNote, createNoteFromTemplate, renameNote, syncNoteMeta, deleteNote, moveNote, moveNoteToPosition, reorderItem, setSidebarNoteOrder, restoreFromTrash, permanentlyDeleteFromTrash, emptyTrash }
})

// --- tree mutation helpers ---

function _removeFolderFromTree(tree: FolderMeta[], folderId: string): boolean {
  const idx = tree.findIndex(f => f.id === folderId)
  if (idx !== -1) { tree.splice(idx, 1); return true }
  for (const node of tree) {
    if (_removeFolderFromTree(node.children, folderId)) return true
  }
  return false
}

function _removeNoteFromTree(tree: FolderMeta[], noteId: string): boolean {
  for (const node of tree) {
    const idx = node.notes.findIndex(n => n.id === noteId)
    if (idx !== -1) { node.notes.splice(idx, 1); return true }
    if (_removeNoteFromTree(node.children, noteId)) return true
  }
  return false
}

function _findNoteInTree(tree: FolderMeta[], noteId: string): NoteMeta | null {
  for (const node of tree) {
    const note = node.notes.find(n => n.id === noteId)
    if (note) return note
    const found = _findNoteInTree(node.children, noteId)
    if (found) return found
  }
  return null
}

function _extractNote(manifest: { tree: FolderMeta[]; rootNotes: NoteMeta[]; rootOrder: string[] }, noteId: string): NoteMeta | null {
  const rootIdx = manifest.rootNotes.findIndex(n => n.id === noteId)
  if (rootIdx !== -1) {
    const [meta] = manifest.rootNotes.splice(rootIdx, 1)
    manifest.rootOrder = manifest.rootOrder.filter(id => id !== noteId)
    return meta
  }
  return _extractNoteFromTree(manifest.tree, noteId)
}

function _extractNoteFromTree(tree: FolderMeta[], noteId: string): NoteMeta | null {
  for (const node of tree) {
    const idx = node.notes.findIndex(n => n.id === noteId)
    if (idx !== -1) return node.notes.splice(idx, 1)[0]
    const found = _extractNoteFromTree(node.children, noteId)
    if (found) return found
  }
  return null
}

function _updateNoteInTree(
  tree: FolderMeta[],
  noteId: string,
  updates: Partial<Pick<NoteMeta, 'title' | 'icon'>>,
  updatedAt?: string,
): boolean {
  for (const node of tree) {
    const note = node.notes.find(n => n.id === noteId)
    if (note) {
      if (typeof updates.title === 'string') note.title = updates.title
      if (typeof updates.icon === 'string') note.icon = updates.icon
      if (updatedAt) note.updatedAt = updatedAt
      return true
    }
    if (_updateNoteInTree(node.children, noteId, updates, updatedAt)) return true
  }
  return false
}
