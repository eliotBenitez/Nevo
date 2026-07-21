import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { WorkspaceManifest } from '../../../types/workspace'
import { createYDocFromContent, encodeYDocState } from '../../../editor-core/collaboration'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { collabCommands, noteCommands } from '../../../tauri/commands'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useNoteStore } from '../../../stores/note'
import { useDrawNoteSync } from './useDrawNoteSync'

vi.mock('../../../tauri/commands', () => ({
  collabCommands: {
    loadYjsState: vi.fn(),
    saveYjsState: vi.fn(async () => undefined),
  },
  noteCommands: {
    touchNoteUpdatedAt: vi.fn(),
  },
}))

const drawBlock = (drawId: string, src = '', svgPreview = '') => ({
  type: 'draw_block',
  attrs: { drawId, src, svgPreview, title: '' },
})

const docWith = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

function encodedDocWithDrawBlock(drawId: string): Uint8Array {
  const ydoc = createYDocFromContent(nevoBaseSchema, docWith(drawBlock(drawId)))
  const bytes = encodeYDocState(ydoc)
  ydoc.destroy()
  return bytes
}

function buildManifest(noteId: string, updatedAt: string): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: updatedAt,
    rootOrder: [noteId],
    tree: [],
    rootNotes: [{ id: noteId, title: 'Draw note', icon: '📄', folderId: null, updatedAt }],
  }
}

describe('useDrawNoteSync', () => {
  const workspacePath = '/workspace'
  const noteId = 'note-1'

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: workspacePath }
    workspaceStore.manifest = buildManifest(noteId, '2000-01-01T00:00:00.000Z')
    useNoteStore().activeNote = null
  })

  it('saves the Y.Doc and touches the note metadata when the draw_block attrs actually change', async () => {
    const mockedCollab = vi.mocked(collabCommands)
    const mockedNote = vi.mocked(noteCommands)
    mockedCollab.loadYjsState.mockResolvedValue(encodedDocWithDrawBlock('draw-1'))
    mockedNote.touchNoteUpdatedAt.mockResolvedValue('2026-07-21T12:00:00.000Z')

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    expect(mockedCollab.saveYjsState).toHaveBeenCalledTimes(1)
    expect(mockedNote.touchNoteUpdatedAt).toHaveBeenCalledWith(workspacePath, noteId)

    const workspaceStore = useWorkspaceStore()
    expect(workspaceStore.manifest?.rootNotes[0].updatedAt).toBe('2026-07-21T12:00:00.000Z')
  })

  it('does not save or touch the note when no matching draw_block is found (no-op patch)', async () => {
    const mockedCollab = vi.mocked(collabCommands)
    const mockedNote = vi.mocked(noteCommands)
    // The persisted doc has no draw_block matching this drawId.
    mockedCollab.loadYjsState.mockResolvedValue(encodedDocWithDrawBlock('some-other-draw'))

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    expect(mockedCollab.saveYjsState).not.toHaveBeenCalled()
    expect(mockedNote.touchNoteUpdatedAt).not.toHaveBeenCalled()

    const workspaceStore = useWorkspaceStore()
    expect(workspaceStore.manifest?.rootNotes[0].updatedAt).toBe('2000-01-01T00:00:00.000Z')
  })

  it('does nothing when the backend is not local', async () => {
    const mockedCollab = vi.mocked(collabCommands)
    const mockedNote = vi.mocked(noteCommands)
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'cloud', storageId: 'storage-1' }

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    expect(mockedCollab.loadYjsState).not.toHaveBeenCalled()
    expect(mockedCollab.saveYjsState).not.toHaveBeenCalled()
    expect(mockedNote.touchNoteUpdatedAt).not.toHaveBeenCalled()
  })
})
