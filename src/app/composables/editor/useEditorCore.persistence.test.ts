import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createEditorCore, useEditorCore } from './useEditorCore'
import { useNoteStore } from '../../../stores/note'
import { useWorkspaceStore } from '../../../stores/workspace'
import { noteCommands } from '../../../tauri/commands'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { getEditorSession } from '../../../core/document-session/editorSessionRegistry'
import type { NoteDocument } from '../../../types/note'
import type { WorkspaceManifest } from '../../../types/workspace'

// `note.json` is a note's only copy of its content once Phase 4 removed the
// editor's disk-backed Y.Doc — these tests exercise that end to end through a
// real EditorView and the same flush path WorkspaceShell's navigation-away
// watcher uses (`noteStore.saveNote()` -> `persistActiveNote()` -> the
// registered editor session's `flushContent()`), not just the persistence
// helper in isolation.
vi.mock('../../../tauri/commands', () => ({
  noteCommands: {
    saveNote: vi.fn(async () => undefined),
    listSidebarNotePreviews: vi.fn(async () => []),
  },
}))

function createNote(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note',
    icon: '',
    folderId: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    content,
  }
}

function buildManifest(): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-09-18T00:00:00.000Z',
    rootOrder: ['note-1'],
    tree: [],
    rootNotes: [{ id: 'note-1', title: 'Note', icon: '', folderId: null, updatedAt: '2026-09-18T00:00:00.000Z' }],
  }
}

function createCallbacks(onContentUpdate: (content: NoteDocument['content']) => void) {
  return {
    onOverlaysUpdate: vi.fn(),
    onCloseOverlays: vi.fn(),
    onContentUpdate,
    onInternalLinkOpen: vi.fn(),
    onImagePickerRequest: vi.fn(),
    onImageContextMenuRequest: vi.fn(),
    onFilePickerRequest: vi.fn(),
    onFileOpenRequest: vi.fn(),
    onMathEditRequest: vi.fn(),
    onFormulaEditRequest: vi.fn(),
    onMathInlineInsert: () => false,
    onMathBlockInsert: () => false,
    onSlashMathItemRan: vi.fn(),
    onSlashEmojiPickRequest: vi.fn(),
    onMermaidEditRequest: vi.fn(),
    onQueryEditRequest: vi.fn(),
    onMarkmapEditRequest: vi.fn(),
    onVegaEditRequest: vi.fn(),
    onPluginNodeEditRequest: vi.fn(),
    onCalloutIconPickRequest: vi.fn(),
    onMediaPickerRequest: vi.fn(),
    onNoteEmbedPickRequest: vi.fn(),
    onEmbedUrlRequest: vi.fn(),
    onNoteEmbedOpen: vi.fn(),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const workspaceStore = useWorkspaceStore()
  workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
  workspaceStore.manifest = buildManifest()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('local note content persistence (real editor + navigation flush)', () => {
  it('flushes an edit made through a real EditorView into note.json when the note store saves on navigation-away', async () => {
    const noteStore = useNoteStore()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved text' }] }],
    })
    noteStore.activeNote = note
    noteStore.isDirty = false

    const core = createEditorCore()
    core.workspacePath = '/workspace'
    const editor = useEditorCore(core, createCallbacks((content) => noteStore.setContent(content)))
    const root = document.createElement('div')
    document.body.appendChild(root)
    await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

    try {
      const view = core.editorView!
      view.dispatch(view.state.tr.insertText('Edited: ', 1))

      // The registered editor session is exactly what WorkspaceShell's
      // `watch(activeNoteId, ...)` -> `flushSave()` -> `noteStore.saveNote()`
      // reaches into on navigation; asserting it exists guards against a
      // regression where a note is opened without ever registering one.
      expect(getEditorSession('note-1')).toBeDefined()

      await noteStore.saveNote()

      expect(noteCommands.saveNote).toHaveBeenCalledTimes(1)
      const [savedWorkspacePath, savedNote] = vi.mocked(noteCommands.saveNote).mock.calls[0]!
      expect(savedWorkspacePath).toBe('/workspace')
      expect(savedNote.content.content?.[0]?.content?.[0]?.text).toBe('Edited: Saved text')
      expect(noteStore.isDirty).toBe(false)
    } finally {
      editor.destroyEditorView()
    }
  })

  it('flushes audio bookmarks through navigation and ignores player clock events', async () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const noteStore = useNoteStore()
    const note = createNote({
      type: 'doc',
      content: [{
        type: 'media_block',
        attrs: { kind: 'audio', src: '.nevo/assets/lecture.mp3', name: 'Lecture', bookmarks: [] },
      }],
    })
    noteStore.activeNote = note
    noteStore.isDirty = false
    const onContentUpdate = vi.fn((content: NoteDocument['content']) => noteStore.setContent(content))
    const core = createEditorCore()
    core.workspacePath = '/workspace'
    const editor = useEditorCore(core, createCallbacks(onContentUpdate))
    const root = document.createElement('div')
    document.body.appendChild(root)
    await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

    try {
      const view = core.editorView!
      const audio = root.querySelector('audio')!
      const seek = root.querySelector<HTMLInputElement>('.nv-audio-seek')!
      expect(seek.disabled).toBe(true)
      audio.dispatchEvent(new Event('timeupdate'))
      editor.flushPendingContentUpdate()
      await noteStore.saveNote()
      expect(noteCommands.saveNote).not.toHaveBeenCalled()
      expect(onContentUpdate).not.toHaveBeenCalled()

      const mediaPos = 0
      const mediaNode = view.state.doc.nodeAt(mediaPos)!
      view.dispatch(view.state.tr.setNodeMarkup(mediaPos, undefined, {
        ...mediaNode.attrs,
        bookmarks: [{ id: 'b1', time: 12.5, label: 'Key point', sourceTag: 'kept' }],
      }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      let currentTime = 0
      Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => currentTime, set: (value: number) => { currentTime = value } })
      root.querySelector<HTMLButtonElement>('[data-bookmark-id="b1"] .nv-audio-time')!.click()
      expect(currentTime).toBe(0)
      Object.defineProperty(audio, 'duration', { configurable: true, value: 30 })
      audio.dispatchEvent(new Event('loadedmetadata'))
      expect(seek.disabled).toBe(false)
      expect(currentTime).toBe(12.5)
      expect(root.querySelector<HTMLElement>('[data-bookmark-id="b1"]')?.dataset.active).toBe('true')
      const rename = root.querySelector<HTMLButtonElement>('[data-bookmark-id="b1"] .nv-audio-icon-button')!
      rename.click()
      const renameInput = root.querySelector<HTMLInputElement>('[data-bookmark-id="b1"] input')!
      expect(document.activeElement).toBe(renameInput)
      audio.dispatchEvent(new Event('timeupdate'))
      expect(root.contains(renameInput)).toBe(true)
      expect(document.activeElement).toBe(renameInput)
      renameInput.value = 'Renamed moment'
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(view.state.doc.nodeAt(mediaPos)?.attrs.bookmarks).toMatchObject([
        { id: 'b1', label: 'Renamed moment', sourceTag: 'kept' },
      ])
      await noteStore.saveNote()

      const [, savedNote] = vi.mocked(noteCommands.saveNote).mock.calls[0]!
      expect(savedNote.content.content?.[0]).toMatchObject({
        type: 'media_block',
        attrs: { bookmarks: [{ id: 'b1', time: 12.5, label: 'Renamed moment', sourceTag: 'kept' }] },
      })

      const addBookmark = root.querySelector<HTMLButtonElement>('.nv-audio-add')!
      addBookmark.click()
      const addInput = root.querySelector<HTMLInputElement>('.nv-audio-bookmark-form input')!
      addInput.value = 'New segment'
      addInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(root.querySelector('.nv-audio-bookmark-form')).toBeNull()
      expect(view.state.doc.nodeAt(mediaPos)?.attrs.bookmarks).toMatchObject([
        { id: 'b1', label: 'Renamed moment', sourceTag: 'kept' },
        { time: 12.5, label: 'New segment' },
      ])
      expect(document.activeElement).toBe(addBookmark)

      addBookmark.click()
      expect(root.querySelector('.nv-audio-bookmark-form input')).not.toBeNull()
      view.setProps({ editable: () => false })
      const readonlyNode = view.state.doc.nodeAt(mediaPos)!
      view.dispatch(view.state.tr.setNodeMarkup(mediaPos, undefined, { ...readonlyNode.attrs, name: 'Locked' }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(addBookmark.hidden).toBe(true)
      expect(root.querySelector('.nv-audio-bookmark-form input')).toBeNull()
      expect(root.querySelectorAll('.nv-audio-icon-button')).toHaveLength(0)
      addBookmark.click()
      expect(view.state.doc.nodeAt(mediaPos)?.attrs.bookmarks).toMatchObject([
        { id: 'b1', time: 12.5, label: 'Renamed moment', sourceTag: 'kept' },
        { time: 12.5, label: 'New segment' },
      ])
    } finally {
      editor.destroyEditorView()
      pauseSpy.mockRestore()
      loadSpy.mockRestore()
    }
  })

  it('never overwrites a note whose stored content this schema could not parse', async () => {
    const noteStore = useNoteStore()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'totally_unknown_block_type', attrs: { foo: 'bar' } }],
    } as unknown as NoteDocument['content'])
    noteStore.activeNote = note
    noteStore.isDirty = false

    const core = createEditorCore()
    core.workspacePath = '/workspace'
    const onContentUpdate = vi.fn((content: NoteDocument['content']) => noteStore.setContent(content))
    const editor = useEditorCore(core, createCallbacks(onContentUpdate))
    const root = document.createElement('div')
    document.body.appendChild(root)
    await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

    try {
      expect(core.contentPersistenceDisabled).toBe(true)

      const view = core.editorView!
      view.dispatch(view.state.tr.insertText('x', 1))
      editor.flushPendingContentUpdate()

      expect(onContentUpdate).not.toHaveBeenCalled()

      await noteStore.saveNote()
      expect(noteCommands.saveNote).not.toHaveBeenCalled()
    } finally {
      editor.destroyEditorView()
    }
  })
})
