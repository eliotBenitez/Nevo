import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { NoteDocument } from '../../../types/note'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { useWorkspaceEditorPresentation } from './useWorkspaceEditorPresentation'

function note(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Presentation',
    icon: '📄',
    cover: 'image:.nevo/assets/cover.jpg',
    folderId: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    content: { type: 'doc', content: [] },
  }
}

describe('useWorkspaceEditorPresentation', () => {
  it('derives cover, editor styles, and breadcrumb actions without owning note state', () => {
    const localGraphOpen = ref(false)
    const requestExport = vi.fn()
    const requestMarkdownImport = vi.fn()
    const presentation = useWorkspaceEditorPresentation({
      getNote: note,
      getSettings: createDefaultWorkspaceSettings,
      getContainerKind: () => null,
      getContainerItems: () => [],
      getScrollbarDragging: () => true,
      workspaceAssetRefreshToken: ref(0),
      resolveWorkspaceAssetSrc: (src) => `asset://${src}`,
      titleInputRef: ref(null),
      localGraphOpen,
      translate: (key) => key,
      emitTitle: vi.fn(),
      requestExport,
      requestMarkdownImport,
    })

    expect(presentation.noteCoverStyle.value).toEqual({
      backgroundImage: 'url("asset://.nevo/assets/cover.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    })
    expect(presentation.editorBodyClasses.value).toMatchObject({
      'doc-body--scrollbar-dragging': true,
    })

    const [exportMenu, importItem, graphItem] = presentation.breadcrumbMenuItems.value
    exportMenu?.items?.[0]?.action?.()
    importItem?.action?.()
    graphItem?.action?.()

    expect(requestExport).toHaveBeenCalledWith('markdown')
    expect(requestMarkdownImport).toHaveBeenCalledOnce()
    expect(localGraphOpen.value).toBe(true)
  })

  it('emits title input and resizes the textarea', () => {
    const titleInput = document.createElement('textarea')
    Object.defineProperty(titleInput, 'scrollHeight', { configurable: true, value: 84 })
    const emitTitle = vi.fn()
    const presentation = useWorkspaceEditorPresentation({
      getNote: note,
      getSettings: createDefaultWorkspaceSettings,
      getContainerKind: () => null,
      getContainerItems: () => [],
      getScrollbarDragging: () => false,
      workspaceAssetRefreshToken: ref(0),
      resolveWorkspaceAssetSrc: (src) => src,
      titleInputRef: ref(titleInput),
      localGraphOpen: ref(false),
      translate: (key) => key,
      emitTitle,
      requestExport: vi.fn(),
      requestMarkdownImport: vi.fn(),
    })
    const input = document.createElement('textarea')
    input.value = 'Renamed'

    presentation.onTitleInput({ target: input } as unknown as Event)

    expect(emitTitle).toHaveBeenCalledWith('Renamed')
    expect(titleInput.style.height).toBe('84px')
  })
})
