import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useArchiveItems } from './useArchiveItems'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import type { TrashedItem, WorkspaceManifest } from '../../types/workspace'

const mockConfirm = vi.fn()

vi.mock('../../ui/composables/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
  }),
}))

import { applyAppLocale } from '../../i18n'

describe('useArchiveItems', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    applyAppLocale('en')
    mockConfirm.mockReset()
  })

  function setupStoreWithTrash(trash: TrashedItem[], folders: Array<{ id: string; title: string }> = []) {
    const workspaceStore = useWorkspaceStore()
    const manifest: Partial<WorkspaceManifest> = {
      trash,
      tree: folders.map((f, index) => ({
        id: f.id,
        title: f.title,
        icon: '📁',
        parentId: null,
        order: index,
        notes: [],
        children: [],
      })),
      rootNotes: [],
      rootOrder: [],
    }
    workspaceStore.manifest = manifest as WorkspaceManifest
    workspaceStore.settings = {
      ...workspaceStore.settings,
      files: {
        ...workspaceStore.settings.files,
        trashRetentionDays: 30,
      },
    }
    return { workspaceStore, treeStore: useTreeStore() }
  }

  it('sorts items by deletedAt descending and filters case-insensitively', () => {
    const items: TrashedItem[] = [
      { id: '1', type: 'note', title: 'Alpha Note', deletedAt: '2026-09-01T10:00:00Z', originalParentId: null },
      { id: '2', type: 'note', title: 'Beta Note', deletedAt: '2026-09-03T10:00:00Z', originalParentId: null },
      { id: '3', type: 'folder', title: 'alpha folder', deletedAt: '2026-09-02T10:00:00Z', originalParentId: null },
    ]
    setupStoreWithTrash(items)

    const { items: resolved, searchQuery, count } = useArchiveItems()

    expect(count.value).toBe(3)
    // Sorted descending by date: id 2 (Sep 3), id 3 (Sep 2), id 1 (Sep 1)
    expect(resolved.value.map(i => i.item.id)).toEqual(['2', '3', '1'])

    // Search case-insensitive
    searchQuery.value = 'ALPHA'
    expect(resolved.value.map(i => i.item.id)).toEqual(['3', '1'])

    searchQuery.value = 'beta'
    expect(resolved.value.map(i => i.item.id)).toEqual(['2'])
  })

  it('resolves parent label from folders, falling back to workspace root', () => {
    const items: TrashedItem[] = [
      { id: '1', type: 'note', title: 'Child Note', deletedAt: '2026-09-01T10:00:00Z', originalParentId: 'folder-1' },
      { id: '2', type: 'note', title: 'Root Note', deletedAt: '2026-09-02T10:00:00Z', originalParentId: null },
      { id: '3', type: 'note', title: 'Orphan Note', deletedAt: '2026-09-03T10:00:00Z', originalParentId: 'missing-folder' },
    ]
    setupStoreWithTrash(items, [{ id: 'folder-1', title: 'Project Docs' }])

    const { items: resolved } = useArchiveItems()

    const item1 = resolved.value.find(i => i.item.id === '1')
    const item2 = resolved.value.find(i => i.item.id === '2')
    const item3 = resolved.value.find(i => i.item.id === '3')

    expect(item1?.parentLabel).toBe('Project Docs')
    expect(item2?.parentLabel).toBe('Workspace root')
    expect(item3?.parentLabel).toBe('Workspace root')
  })

  it('restores an item via treeStore without a confirmation prompt', async () => {
    setupStoreWithTrash([
      { id: '1', type: 'note', title: 'Note 1', deletedAt: '2026-09-01T10:00:00Z', originalParentId: null },
    ])
    const treeStore = useTreeStore()
    const spy = vi.spyOn(treeStore, 'restoreFromTrash').mockResolvedValue()

    const { restore } = useArchiveItems()
    const result = await restore('1')

    expect(result).toBe(true)
    expect(spy).toHaveBeenCalledWith('1')
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('deletes permanently only when confirmed', async () => {
    setupStoreWithTrash([
      { id: '1', type: 'note', title: 'Note 1', deletedAt: '2026-09-01T10:00:00Z', originalParentId: null },
    ])
    const treeStore = useTreeStore()
    const spy = vi.spyOn(treeStore, 'permanentlyDeleteFromTrash').mockResolvedValue()

    const { deleteForever } = useArchiveItems()

    // Cancelled
    mockConfirm.mockResolvedValueOnce(false)
    const cancelled = await deleteForever('1')
    expect(cancelled).toBe(false)
    expect(spy).not.toHaveBeenCalled()

    // Confirmed
    mockConfirm.mockResolvedValueOnce(true)
    const confirmed = await deleteForever('1')
    expect(confirmed).toBe(true)
    expect(spy).toHaveBeenCalledWith('1')
  })

  it('empties archive only when confirmed', async () => {
    setupStoreWithTrash([
      { id: '1', type: 'note', title: 'Note 1', deletedAt: '2026-09-01T10:00:00Z', originalParentId: null },
      { id: '2', type: 'note', title: 'Note 2', deletedAt: '2026-09-02T10:00:00Z', originalParentId: null },
    ])
    const treeStore = useTreeStore()
    const spy = vi.spyOn(treeStore, 'emptyTrash').mockResolvedValue()

    const { emptyArchive } = useArchiveItems()

    // Cancelled
    mockConfirm.mockResolvedValueOnce(false)
    const cancelled = await emptyArchive()
    expect(cancelled).toBe(false)
    expect(spy).not.toHaveBeenCalled()

    // Confirmed
    mockConfirm.mockResolvedValueOnce(true)
    const confirmed = await emptyArchive()
    expect(confirmed).toBe(true)
    expect(spy).toHaveBeenCalled()
  })

  it('keeps selection valid after restore, delete, and filtering', async () => {
    const { workspaceStore, treeStore } = setupStoreWithTrash([
      { id: '1', type: 'note', title: 'First Note', deletedAt: '2026-09-03T10:00:00Z', originalParentId: null },
      { id: '2', type: 'note', title: 'Second Note', deletedAt: '2026-09-02T10:00:00Z', originalParentId: null },
      { id: '3', type: 'note', title: 'Third Note', deletedAt: '2026-09-01T10:00:00Z', originalParentId: null },
    ])

    const { items, selectedId, selectedItem, select, searchQuery } = useArchiveItems()

    // Defaults to first item
    expect(selectedId.value).toBe('1')
    expect(selectedItem.value?.item.id).toBe('1')

    // Select second item
    select('2')
    expect(selectedId.value).toBe('2')

    // Restore item 2 -> selection moves to next item (3)
    vi.spyOn(treeStore, 'restoreFromTrash').mockImplementation(async (id: string) => {
      workspaceStore.manifest!.trash = workspaceStore.manifest!.trash!.filter(item => item.id !== id)
    })
    await treeStore.restoreFromTrash('2')
    expect(items.value.map(i => i.item.id)).toEqual(['1', '3'])
    expect(selectedId.value).toBe('3')

    // Restore item 3 (last item) -> selection moves to previous item (1)
    await treeStore.restoreFromTrash('3')
    expect(items.value.map(i => i.item.id)).toEqual(['1'])
    expect(selectedId.value).toBe('1')

    // Delete item 1 -> archive is empty, selection is null
    vi.spyOn(treeStore, 'permanentlyDeleteFromTrash').mockImplementation(async (id: string) => {
      workspaceStore.manifest!.trash = workspaceStore.manifest!.trash!.filter(item => item.id !== id)
    })
    await treeStore.permanentlyDeleteFromTrash('1')
    expect(items.value).toHaveLength(0)
    expect(selectedId.value).toBeNull()
    expect(selectedItem.value).toBeNull()

    // Repopulate and test filtering
    workspaceStore.manifest!.trash = [
      { id: '1', type: 'note', title: 'Apples', deletedAt: '2026-09-03T10:00:00Z', originalParentId: null },
      { id: '2', type: 'note', title: 'Bananas', deletedAt: '2026-09-02T10:00:00Z', originalParentId: null },
    ]
    select('2')
    expect(selectedId.value).toBe('2')

    // Filter to only match Apples -> selection moves to Apples
    searchQuery.value = 'Apples'
    expect(items.value.map(i => i.item.id)).toEqual(['1'])
    expect(selectedId.value).toBe('1')
  })
})
