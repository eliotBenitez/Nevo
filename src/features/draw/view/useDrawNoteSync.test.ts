import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { WorkspaceManifest } from '../../../types/workspace'
import type { BlockNode, NoteDocument } from '../../../types/note'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useNoteStore } from '../../../stores/note'
import { useDrawNoteSync } from './useDrawNoteSync'

vi.mock('../../../tauri/commands', () => ({
  noteCommands: {
    saveNote: vi.fn(async () => undefined),
  },
}))

const drawBlock = (drawId: string, src = '', svgPreview = ''): BlockNode => ({
  type: 'draw_block',
  attrs: { drawId, src, svgPreview, title: '' },
})

const docWith = (...blocks: BlockNode[]): BlockNode => ({ type: 'doc', content: blocks })

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

function buildNote(noteId: string, drawId: string): NoteDocument {
  return {
    id: noteId,
    title: 'Draw note',
    icon: '📄',
    folderId: null,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    content: docWith(drawBlock(drawId)),
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

  it('patches note.content and saves it when the draw_block attrs actually change', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = buildNote(noteId, 'draw-1')
    const saveNoteSpy = vi.spyOn(noteStore, 'saveNote').mockResolvedValue(undefined)

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    const patchedBlock = noteStore.activeNote?.content.content?.[0]
    expect(patchedBlock?.attrs?.src).toBe('.nevo/assets/draw-1.draw.json')
    expect(patchedBlock?.attrs?.svgPreview).toBe('<svg/>')
    expect(saveNoteSpy).toHaveBeenCalledTimes(1)
  })

  it('does not patch or save when no matching draw_block is found (no-op patch)', async () => {
    const noteStore = useNoteStore()
    const note = buildNote(noteId, 'some-other-draw')
    noteStore.activeNote = note
    const saveNoteSpy = vi.spyOn(noteStore, 'saveNote').mockResolvedValue(undefined)

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    // `noteStore.activeNote` is a reactive ref, so the read comes back as a
    // proxy — assert structural, not referential, equality against the
    // original content.
    expect(noteStore.activeNote?.content).toEqual(note.content)
    expect(saveNoteSpy).not.toHaveBeenCalled()
  })

  it('does not patch or save when the active note does not match the drawing note', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = buildNote('other-note', 'draw-1')
    const saveNoteSpy = vi.spyOn(noteStore, 'saveNote').mockResolvedValue(undefined)

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    expect(saveNoteSpy).not.toHaveBeenCalled()
  })

  it('does nothing when there is no open local workspace', async () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = buildNote(noteId, 'draw-1')
    const saveNoteSpy = vi.spyOn(noteStore, 'saveNote').mockResolvedValue(undefined)
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = null

    const sync = useDrawNoteSync({
      drawId: 'draw-1',
      getWorkspacePath: () => workspacePath,
      getNoteId: () => noteId,
    })

    await sync.patchDrawSrcIntoNoteDoc('.nevo/assets/draw-1.draw.json', '<svg/>')
    await sync.awaitDocPatch()

    expect(saveNoteSpy).not.toHaveBeenCalled()
  })
})
