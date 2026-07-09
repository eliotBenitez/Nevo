import { nextTick, reactive } from 'vue'
import type { Ref } from 'vue'
import type { FolderMeta, NoteDocument, NoteMeta } from '../../types/note'
import type { WorkspaceManifest, WorkspaceSettings } from '../../types/workspace'
import { noteCommands } from '../../tauri/commands'
import { useConfirmDialog } from '../../ui/composables/useConfirmDialog'

type TreeMenuAction = 'rename' | 'delete' | 'search' | 'history' | 'export'
type ExportFormat = 'markdown' | 'html' | 'docx' | 'typst' | 'pdf'
export type TreeMenuTarget = { kind: 'folder' | 'note'; id: string; title: string; folderId: string | null }

interface TreeOps {
  deleteNote: (id: string) => Promise<void>
  deleteFolder: (id: string, recursive: boolean) => Promise<void>
  renameFolder: (id: string, title: string) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  syncNoteMeta: (id: string, updates: Partial<Pick<NoteMeta, 'title' | 'icon'>>) => void
}

interface ContextMenuDeps {
  settings: Ref<WorkspaceSettings>
  manifest: Ref<WorkspaceManifest | null>
  activeNoteId: Ref<string | null>
  activeFolderId: Ref<string | null>
  activeNote: Ref<NoteDocument | null>
  workspacePath: Ref<string | null>
  treeOps: TreeOps
  clearNote: () => void
  setTitle: (v: string) => void
  flushSave: () => void | Promise<void>
  t: (key: string) => string
  renameInputRef: Ref<HTMLInputElement | null>
}

interface ContextMenuHandlers {
  openHistory: (id: string | null) => void
  runSearch: (seed?: string) => Promise<void>
  navigateToWorkspaceRoot: () => Promise<void>
  exportAsMarkdown: (note: NoteDocument, path: string) => Promise<void>
  exportAsHtml: (note: NoteDocument, path: string) => Promise<void>
  exportAsDocx: (note: NoteDocument, path: string) => Promise<void>
  exportAsTypst: (note: NoteDocument, path: string) => Promise<void>
  exportAsPdf: (note: NoteDocument, path: string) => void
}

export function useTreeContextMenu(deps: ContextMenuDeps, handlers: ContextMenuHandlers) {
  const renameModal = reactive<{ open: boolean; target: TreeMenuTarget | null; title: string }>({ open: false, target: null, title: '' })
  const { confirm } = useConfirmDialog()

  function closeRenameModal() {
    renameModal.open = false; renameModal.target = null; renameModal.title = ''
  }

  function collectFolderBranch(folder: FolderMeta) {
    const folderIds = new Set<string>(); const noteIds = new Set<string>()
    const walk = (node: FolderMeta) => {
      folderIds.add(node.id)
      for (const note of node.notes) noteIds.add(note.id)
      for (const child of node.children) walk(child)
    }
    walk(folder)
    return { folderIds, noteIds }
  }

  function findFolderById(folders: FolderMeta[], folderId: string): FolderMeta | null {
    for (const folder of folders) {
      if (folder.id === folderId) return folder
      const child = findFolderById(folder.children, folderId)
      if (child) return child
    }
    return null
  }

  async function exportTarget(target: TreeMenuTarget, format: ExportFormat) {
    if (target.kind !== 'note') return
    const path = deps.workspacePath.value
    if (!path) return
    const isActive = deps.activeNote.value?.id === target.id
    if (isActive && format === 'pdf') await deps.flushSave()
    let note: NoteDocument | null = isActive ? deps.activeNote.value : null
    if (!note) note = await noteCommands.loadNote(path, target.id)
    if (format === 'markdown') await handlers.exportAsMarkdown(note, path)
    else if (format === 'html') await handlers.exportAsHtml(note, path)
    else if (format === 'docx') await handlers.exportAsDocx(note, path)
    else if (format === 'typst') await handlers.exportAsTypst(note, path)
    else handlers.exportAsPdf(note, path)
  }

  async function onTreeAction(payload: { action: TreeMenuAction; target: TreeMenuTarget; format?: ExportFormat }) {
    const { action, target, format } = payload
    if (action === 'rename') {
      renameModal.open = true; renameModal.target = target; renameModal.title = target.title
      void nextTick(() => deps.renameInputRef.value?.focus())
      return
    }
    if (action === 'delete') {
      if (deps.settings.value.general.confirmBeforeDelete && !await confirm({
        message: deps.t('workspace.context.deleteConfirm'),
        confirmLabel: deps.t('confirmDialog.delete'),
        variant: 'danger',
      })) return
      if (target.kind === 'note') {
        await deps.treeOps.deleteNote(target.id)
        if (deps.activeNoteId.value === target.id) { deps.clearNote(); await handlers.navigateToWorkspaceRoot() }
        return
      }
      const folder = deps.manifest.value ? findFolderById(deps.manifest.value.tree, target.id) : null
      const branch = folder ? collectFolderBranch(folder) : null
      await deps.treeOps.deleteFolder(target.id, true)
      if (branch && (branch.folderIds.has(deps.activeFolderId.value ?? '') || branch.noteIds.has(deps.activeNoteId.value ?? ''))) {
        deps.clearNote(); await handlers.navigateToWorkspaceRoot()
      }
      return
    }
    if (action === 'search') { await handlers.runSearch(target.title); return }
    if (action === 'history') { if (target.kind === 'note') handlers.openHistory(target.id); return }
    if (action === 'export' && format) await exportTarget(target, format)
  }

  async function handleRequestExport(format: ExportFormat) {
    const note = deps.activeNote.value
    if (!note) return
    await exportTarget({ kind: 'note', id: note.id, title: note.title, folderId: note.folderId }, format)
  }

  async function submitRename() {
    const target = renameModal.target
    const nextTitle = renameModal.title.trim()
    if (!target || !nextTitle) return
    if (target.kind === 'folder') { await deps.treeOps.renameFolder(target.id, nextTitle); closeRenameModal(); return }
    if (deps.activeNoteId.value === target.id) {
      deps.setTitle(nextTitle)
      deps.treeOps.syncNoteMeta(target.id, { title: nextTitle })
      deps.flushSave(); closeRenameModal(); return
    }
    await deps.treeOps.renameNote(target.id, nextTitle)
    closeRenameModal()
  }

  return { renameModal, onTreeAction, handleRequestExport, submitRename, closeRenameModal }
}
