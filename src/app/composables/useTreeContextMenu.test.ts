import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTreeContextMenu, type TreeMenuTarget } from './useTreeContextMenu'
import { useToast } from '../../ui/composables/useToast'
import type { WorkspaceSettings } from '../../types/workspace'

const toast = useToast()

afterEach(() => {
  toast.toastState.items.map(item => item.id).forEach(toast.dismissToast)
})

function setup(activeNoteId: string | null, workspacePath = ref<string | null>('/ws')) {
  const treeOps = {
    deleteNote: vi.fn(async () => {}),
    restoreFromTrash: vi.fn(async () => {}),
    deleteFolder: vi.fn(async () => {}),
    renameFolder: vi.fn(async () => {}),
    renameNote: vi.fn(async () => {}),
    syncNoteMeta: vi.fn(),
  }
  const handlers = {
    openHistory: vi.fn(),
    runSearch: vi.fn(async () => {}),
    navigateToNote: vi.fn(async () => {}),
    navigateToWorkspaceRoot: vi.fn(async () => {}),
    exportAsMarkdown: vi.fn(async () => {}),
    exportAsHtml: vi.fn(async () => {}),
    exportAsDocx: vi.fn(async () => {}),
    exportAsTypst: vi.fn(async () => {}),
    exportAsPdf: vi.fn(),
  }
  const menu = useTreeContextMenu({
    settings: ref({ general: { confirmBeforeDelete: false } } as WorkspaceSettings),
    manifest: ref(null),
    activeNoteId: ref(activeNoteId),
    activeFolderId: ref(null),
    activeNote: ref(null),
    workspacePath,
    treeOps,
    clearNote: vi.fn(),
    closeNoteTab: vi.fn(() => null),
    setTitle: vi.fn(),
    flushSave: vi.fn(),
    t: (key: string) => key,
    renameInputRef: ref(null),
  }, handlers)
  return { menu, treeOps, handlers }
}

const note: TreeMenuTarget = { kind: 'note', id: 'n1', title: 'Plan', folderId: 'f1' }

describe('useTreeContextMenu delete undo', () => {
  it('offers an undo toast after deleting a note that restores it and reopens it when it was open', async () => {
    const { menu, treeOps, handlers } = setup('n1')
    await menu.onTreeAction({ action: 'delete', target: note })

    expect(treeOps.deleteNote).toHaveBeenCalledWith('n1')
    const [item] = toast.toastState.items
    expect(item.message).toBe('workspace.context.noteArchived')
    expect(item.action?.label).toBe('common.undo')
    expect(item.variant).toBe('success')

    await toast.runToastAction(item.id)
    expect(treeOps.restoreFromTrash).toHaveBeenCalledWith('n1')
    expect(handlers.navigateToNote).toHaveBeenCalledWith('n1')
    expect(toast.toastState.items).toHaveLength(0)
  })

  it('restores a background note without navigating to it', async () => {
    const { menu, treeOps, handlers } = setup('other')
    await menu.onTreeAction({ action: 'delete', target: note })
    await toast.runToastAction(toast.toastState.items[0].id)
    expect(treeOps.restoreFromTrash).toHaveBeenCalledWith('n1')
    expect(handlers.navigateToNote).not.toHaveBeenCalled()
  })

  it('drops the undo when the workspace changes before it is clicked', async () => {
    const workspacePath = ref<string | null>('/ws')
    const { menu, treeOps } = setup('other', workspacePath)
    await menu.onTreeAction({ action: 'delete', target: note })
    const [item] = toast.toastState.items
    workspacePath.value = '/other'
    await toast.runToastAction(item.id)
    expect(treeOps.restoreFromTrash).not.toHaveBeenCalled()
    await nextTick()
    expect(toast.toastState.items).toHaveLength(0)
  })

  it('does not offer undo for folder deletion', async () => {
    const { menu } = setup(null)
    await menu.onTreeAction({ action: 'delete', target: { kind: 'folder', id: 'f1', title: 'F', folderId: null } })
    expect(toast.toastState.items).toHaveLength(0)
  })
})
