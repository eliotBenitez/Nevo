import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import { nevoBaseSchema } from '../../editor-core/schema'
import type { NoteDocument } from '../../types/note'
import type { CanvasConnector, CanvasDocumentFrame, CanvasElement } from '../canvas/types'
import { emptyCanvasSnapshot } from '../canvas/normalize'
import { LEGACY_Y_FRAGMENT_NAME } from './decodeLegacyNoteYDoc'
import {
  migrateWorkspaceYjs,
  type ArchiveLegacyCollabDirResult,
  type LegacyYjsMigrationDeps,
} from './migrateWorkspaceYjs'

// `unsupported` can never be produced by the real decode path here — the
// migration always calls with `validateSchema: false` (see the comment in
// `migrateWorkspaceYjs.ts`), so it is exercised below by overriding a single
// call of the real decoder rather than by constructing bytes for it. Every
// other test uses the real, un-mocked decode logic.
vi.mock('./decodeLegacyNoteYDoc', async () => {
  const actual = await vi.importActual<typeof import('./decodeLegacyNoteYDoc')>('./decodeLegacyNoteYDoc')
  return { ...actual, decodeLegacyPersistedNoteYDoc: vi.fn(actual.decodeLegacyPersistedNoteYDoc) }
})

const PLACEHOLDER_CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'seed' }] }],
}

function docContent(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

interface LegacyDocFixture {
  content?: Record<string, unknown>
  frame?: CanvasDocumentFrame
  elements?: Record<string, CanvasElement>
  connectors?: Record<string, CanvasConnector>
  order?: string[]
  legacyLayouts?: Record<string, { blockId: string; x: number; y: number; width: number; height: number; zIndex: number }>
}

function buildLegacyBytes(fixture: LegacyDocFixture = {}): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(nevoBaseSchema, fixture.content ?? PLACEHOLDER_CONTENT, LEGACY_Y_FRAGMENT_NAME)
  ydoc.transact(() => {
    if (fixture.frame) ydoc.getMap<CanvasDocumentFrame>('canvas.frame').set('value', fixture.frame)
    if (fixture.elements) {
      const map = ydoc.getMap<CanvasElement>('canvas.elements')
      for (const [id, element] of Object.entries(fixture.elements)) map.set(id, element)
    }
    if (fixture.connectors) {
      const map = ydoc.getMap<CanvasConnector>('canvas.connectors')
      for (const [id, connector] of Object.entries(fixture.connectors)) map.set(id, connector)
    }
    if (fixture.order) ydoc.getArray<string>('canvas.order').insert(0, fixture.order)
    if (fixture.legacyLayouts) {
      const map = ydoc.getMap('canvas.layouts')
      for (const [id, layout] of Object.entries(fixture.legacyLayouts)) map.set(id, layout)
    }
  })
  const bytes = Y.encodeStateAsUpdate(ydoc)
  ydoc.destroy()
  return bytes
}

function corruptBytes(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 200, 255])
}

function makeNote(id: string, overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id,
    title: `Note ${id}`,
    icon: '📝',
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: docContent('original'),
    ...overrides,
  }
}

interface FakeWorkspace {
  notes: Map<string, NoteDocument>
  yjs: Map<string, Uint8Array>
  loadNote: Mock<(noteId: string) => Promise<NoteDocument>>
  saveNote: Mock<(note: NoteDocument) => Promise<void>>
  loadYjsState: Mock<(workspacePath: string, noteId: string) => Promise<Uint8Array>>
  archiveLegacyCollabDir: Mock<(workspacePath: string, noteIds: string[]) => Promise<ArchiveLegacyCollabDirResult>>
}

function makeFakeWorkspace(notes: NoteDocument[], yjs: Record<string, Uint8Array>): FakeWorkspace {
  const noteMap = new Map(notes.map(note => [note.id, note]))
  const yjsMap = new Map(Object.entries(yjs))
  const loadNote: FakeWorkspace['loadNote'] = vi.fn(async (noteId: string) => {
    const note = noteMap.get(noteId)
    if (!note) throw new Error(`Unknown note ${noteId}`)
    return note
  })
  const saveNote: FakeWorkspace['saveNote'] = vi.fn(async (note: NoteDocument) => {
    noteMap.set(note.id, note)
  })
  const loadYjsState: FakeWorkspace['loadYjsState'] = vi.fn(
    async (_workspacePath: string, noteId: string) => yjsMap.get(noteId) ?? new Uint8Array(),
  )
  const archiveLegacyCollabDir: FakeWorkspace['archiveLegacyCollabDir'] = vi.fn(async () => ({
    archived: true,
    archivePath: '.nevo/collab-legacy-1234567890',
  }))
  return { notes: noteMap, yjs: yjsMap, loadNote, saveNote, loadYjsState, archiveLegacyCollabDir }
}

function depsFor(workspace: FakeWorkspace, noteIds: string[]): LegacyYjsMigrationDeps {
  return {
    workspacePath: '/workspace',
    noteIds,
    loadNote: workspace.loadNote,
    saveNote: workspace.saveNote,
    loadYjsState: workspace.loadYjsState,
    archiveLegacyCollabDir: workspace.archiveLegacyCollabDir,
  }
}

describe('migrateWorkspaceYjs', () => {
  beforeEach(async () => {
    const { decodeLegacyPersistedNoteYDoc } = await import('./decodeLegacyNoteYDoc')
    vi.mocked(decodeLegacyPersistedNoteYDoc).mockClear()
  })

  it('rewrites note.json when the Y.Doc body is ahead of note.content', async () => {
    const note = makeNote('note-1', { content: docContent('stale') })
    const workspace = makeFakeWorkspace([note], {
      'note-1': buildLegacyBytes({ content: docContent('fresh from yjs') }),
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-1']))

    expect(result.migrated).toBe(1)
    expect(result.unchanged).toBe(0)
    expect(workspace.saveNote).toHaveBeenCalledTimes(1)
    const saved = workspace.saveNote.mock.calls[0][0] as NoteDocument
    expect(saved.content).toEqual(docContent('fresh from yjs'))
    expect(result.archived).toBe(true)
  })

  it('rewrites the canvas mirror when the Y.Doc canvas (elements/order/frame) is ahead', async () => {
    const frame: CanvasDocumentFrame = { x: 10, y: 20, width: 900, height: 1200, zIndex: 0, autoHeight: true }
    const elements: Record<string, CanvasElement> = {
      el1: { id: 'el1', kind: 'text', x: 0, y: 0, width: 180, height: 120, zIndex: 1, text: 'hi' },
    }
    const note = makeNote('note-2', { canvas: emptyCanvasSnapshot() })
    const workspace = makeFakeWorkspace([note], {
      'note-2': buildLegacyBytes({ frame, elements, order: ['el1'] }),
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-2']))

    expect(result.migrated).toBe(1)
    const saved = workspace.saveNote.mock.calls[0][0] as NoteDocument
    expect(saved.canvas?.frame).toEqual(frame)
    const el1 = saved.canvas?.elements.el1
    expect(el1 && 'text' in el1 ? el1.text : undefined).toBe('hi')
    expect(saved.canvas?.order).toContain('el1')
  })

  it('migrates a legacy canvas.layouts doc into a normalized frame', async () => {
    const note = makeNote('note-3')
    const workspace = makeFakeWorkspace([note], {
      'note-3': buildLegacyBytes({
        legacyLayouts: {
          'block-a': { blockId: 'block-a', x: 0, y: 0, width: 560, height: 180, zIndex: 0 },
        },
      }),
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-3']))

    expect(result.migrated).toBe(1)
    const saved = workspace.saveNote.mock.calls[0][0] as NoteDocument
    expect(saved.canvas).toBeDefined()
    expect(saved.canvas?.frame.width).toBeGreaterThanOrEqual(560)
  })

  it('does not save when the Y.Doc and note.json already match', async () => {
    const content = docContent('same everywhere')
    const note = makeNote('note-4', { content })
    const workspace = makeFakeWorkspace([note], {
      'note-4': buildLegacyBytes({ content }),
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-4']))

    expect(result.migrated).toBe(0)
    expect(result.unchanged).toBe(1)
    expect(workspace.saveNote).not.toHaveBeenCalled()
  })

  it('leaves note.json untouched for missing/unsupported/corrupt notes, counts them, and keeps processing others', async () => {
    const { decodeLegacyPersistedNoteYDoc } = await import('./decodeLegacyNoteYDoc')
    vi.mocked(decodeLegacyPersistedNoteYDoc).mockReturnValueOnce({ kind: 'unsupported', error: new Error('unknown node') })

    const okContent = docContent('processed after the skips')
    const notes = [
      makeNote('missing-note'),
      makeNote('unsupported-note'),
      makeNote('corrupt-note'),
      makeNote('ok-note', { content: docContent('stale') }),
    ]
    const workspace = makeFakeWorkspace(notes, {
      'missing-note': new Uint8Array(),
      'unsupported-note': buildLegacyBytes({ content: docContent('irrelevant, decode is mocked') }),
      'corrupt-note': corruptBytes(),
      'ok-note': buildLegacyBytes({ content: okContent }),
    })

    // `unsupported-note` must be processed first: the mocked
    // `mockReturnValueOnce` above overrides only the very next call to
    // `decodeLegacyPersistedNoteYDoc`, regardless of which note it's for.
    const result = await migrateWorkspaceYjs(depsFor(workspace, [
      'unsupported-note', 'missing-note', 'corrupt-note', 'ok-note',
    ]))

    expect(result.skipped).toEqual(expect.arrayContaining([
      { noteId: 'missing-note', reason: 'missing' },
      { noteId: 'unsupported-note', reason: 'unsupported' },
      { noteId: 'corrupt-note', reason: 'corrupt' },
    ]))
    expect(result.skipped).toHaveLength(3)
    expect(result.migrated).toBe(1)
    const saved = workspace.saveNote.mock.calls[0][0] as NoteDocument
    expect(saved.id).toBe('ok-note')
    expect(saved.content).toEqual(okContent)
    // Skipped notes must never be written.
    expect(workspace.notes.get('missing-note')?.content).toEqual(docContent('original'))
    expect(result.archived).toBe(true)
  })

  it('keeps processing other notes and skips archiving when a save rejects', async () => {
    const notes = [
      makeNote('fails-to-save', { content: docContent('stale') }),
      makeNote('saves-fine', { content: docContent('stale') }),
    ]
    const workspace = makeFakeWorkspace(notes, {
      'fails-to-save': buildLegacyBytes({ content: docContent('new') }),
      'saves-fine': buildLegacyBytes({ content: docContent('new') }),
    })
    workspace.saveNote.mockImplementation(async (note: NoteDocument) => {
      if (note.id === 'fails-to-save') throw new Error('disk full')
      workspace.notes.set(note.id, note)
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['fails-to-save', 'saves-fine']))

    expect(result.failed).toEqual([{ noteId: 'fails-to-save', error: expect.any(Error) }])
    expect(result.migrated).toBe(1)
    expect(workspace.notes.get('saves-fine')?.content).toEqual(docContent('new'))
    expect(workspace.archiveLegacyCollabDir).not.toHaveBeenCalled()
    expect(result.archived).toBe(false)
    expect(result.archivePath).toBeNull()
  })

  it('archives exactly once when every note is processed without failure', async () => {
    const notes = [makeNote('note-a'), makeNote('note-b')]
    const workspace = makeFakeWorkspace(notes, {
      'note-a': new Uint8Array(),
      'note-b': new Uint8Array(),
    })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-a', 'note-b']))

    expect(workspace.archiveLegacyCollabDir).toHaveBeenCalledTimes(1)
    expect(workspace.archiveLegacyCollabDir).toHaveBeenCalledWith('/workspace', ['note-a', 'note-b'])
    expect(result.archived).toBe(true)
    expect(result.archivePath).toBe('.nevo/collab-legacy-1234567890')
  })

  it('is a no-op the second time it runs, once .nevo/collab is already gone', async () => {
    const notes = [makeNote('note-a')]
    const workspace = makeFakeWorkspace(notes, { 'note-a': new Uint8Array() })
    // Second run: the archive command reports nothing left to archive.
    workspace.archiveLegacyCollabDir.mockResolvedValue({ archived: false, archivePath: null })

    const result = await migrateWorkspaceYjs(depsFor(workspace, ['note-a']))

    expect(result.migrated).toBe(0)
    expect(result.skipped).toEqual([{ noteId: 'note-a', reason: 'missing' }])
    expect(result.failed).toEqual([])
    expect(result.archived).toBe(false)
    expect(result.archivePath).toBeNull()
  })
})
