import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useArchivePreview } from './useArchivePreview'
import { useWorkspaceStore } from '../../stores/workspace'
import type { ArchiveItemViewModel } from './useArchiveItems'
import type { NoteDocument } from '../../types/note'

const mockBackend = {
  loadNote: vi.fn(),
}

vi.mock('../../core/workspace-backend', async () => {
  const actual = await vi.importActual<typeof import('../../core/workspace-backend')>('../../core/workspace-backend')
  return {
    ...actual,
    resolveBackend: () => mockBackend,
  }
})

describe('useArchivePreview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
    mockBackend.loadNote.mockReset()
  })

  function createViewModel(id: string, type: 'note' | 'folder', title = 'Item'): ArchiveItemViewModel {
    return {
      item: {
        id,
        type,
        title,
        deletedAt: '2026-09-24T10:00:00Z',
        originalParentId: null,
      },
      title,
      parentLabel: 'Root',
      deletedLabel: 'deleted today',
      daysLeft: 30,
      tone: 'normal',
    }
  }

  function createDocWithParagraphs(count: number): NoteDocument {
    return {
      id: 'note-1',
      title: 'Test Note',
      icon: '📄',
      folderId: null,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-24T00:00:00Z',
      content: {
        type: 'doc',
        content: Array.from({ length: count }, (_, i) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `Paragraph ${i + 1}` }],
        })),
      },
    }
  }

  it('loads note preview and caps blocks at 12 with remaining moreCount', async () => {
    const doc = createDocWithParagraphs(15)
    mockBackend.loadNote.mockResolvedValue(doc)

    const selectedItem = ref<ArchiveItemViewModel | null>(createViewModel('note-1', 'note'))
    const { loading, error, blocks, moreCount, kind } = useArchivePreview(selectedItem)

    // Wait for the async watcher to resolve
    await vi.waitFor(() => expect(loading.value).toBe(false))

    expect(mockBackend.loadNote).toHaveBeenCalledWith('note-1')
    expect(kind.value).toBe('note')
    expect(error.value).toBeNull()
    expect(blocks.value).toHaveLength(12)
    expect(moreCount.value).toBe(3)
  })

  it('handles folder selection without calling backend', async () => {
    const selectedItem = ref<ArchiveItemViewModel | null>(createViewModel('folder-1', 'folder'))
    const { loading, error, blocks, moreCount, kind } = useArchivePreview(selectedItem)

    await vi.waitFor(() => expect(kind.value).toBe('folder'))

    expect(mockBackend.loadNote).not.toHaveBeenCalled()
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(blocks.value).toHaveLength(0)
    expect(moreCount.value).toBe(0)
  })

  it('sets error state when backend loadNote rejects', async () => {
    mockBackend.loadNote.mockRejectedValue(new Error('Disk read error'))

    const selectedItem = ref<ArchiveItemViewModel | null>(createViewModel('note-err', 'note'))
    const { loading, error, blocks, kind } = useArchivePreview(selectedItem)

    await vi.waitFor(() => expect(loading.value).toBe(false))

    expect(kind.value).toBe('note')
    expect(error.value).toBe('Disk read error')
    expect(blocks.value).toHaveLength(0)
  })

  it('ignores stale response when selection changes mid-flight', async () => {
    let resolveFirst: (doc: NoteDocument) => void
    const firstPromise = new Promise<NoteDocument>((resolve) => {
      resolveFirst = resolve
    })

    const doc2 = createDocWithParagraphs(2)
    mockBackend.loadNote.mockImplementation((id: string) => {
      if (id === 'note-1') return firstPromise
      return Promise.resolve(doc2)
    })

    const selectedItem = ref<ArchiveItemViewModel | null>(createViewModel('note-1', 'note'))
    const { loading, blocks } = useArchivePreview(selectedItem)

    expect(loading.value).toBe(true)

    // Switch selection to note-2 while note-1 is still loading
    selectedItem.value = createViewModel('note-2', 'note')
    await vi.waitFor(() => expect(blocks.value).toHaveLength(2))

    // Now resolve note-1 with 15 paragraphs
    resolveFirst!(createDocWithParagraphs(15))
    // Yield to let any microtasks run
    await new Promise(r => setTimeout(r, 10))

    // blocks must still belong to note-2, NOT note-1
    expect(blocks.value).toHaveLength(2)
  })

  it('resets state when selection becomes null', async () => {
    mockBackend.loadNote.mockResolvedValue(createDocWithParagraphs(1))

    const selectedItem = ref<ArchiveItemViewModel | null>(createViewModel('note-1', 'note'))
    const { loading, blocks, kind } = useArchivePreview(selectedItem)

    await vi.waitFor(() => expect(loading.value).toBe(false))
    expect(blocks.value).toHaveLength(1)

    selectedItem.value = null
    await vi.waitFor(() => expect(kind.value).toBeNull())
    expect(blocks.value).toHaveLength(0)
  })
})
