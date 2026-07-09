import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import WorkspaceHistoryModal from './WorkspaceHistoryModal.vue'
import en from '../../locales/en.json'
import type { NoteDocument, NoteSnapshotMeta, NoteSnapshotsEntry } from '../../types/note'
import type { WorkspaceManifest } from '../../types/workspace'
import { noteCommands } from '../../tauri/commands'

vi.mock('../../tauri/commands', () => ({
  noteCommands: {
    createNote: vi.fn(),
    loadNote: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    moveNote: vi.fn(),
    listNoteSnapshots: vi.fn(),
    listAllNoteSnapshots: vi.fn(),
    loadNoteSnapshot: vi.fn(),
    restoreNoteSnapshot: vi.fn(),
    pruneNoteSnapshots: vi.fn(),
    importImageAsset: vi.fn(),
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const manifest: WorkspaceManifest = {
  id: 'workspace-1',
  name: 'Workspace',
  glyph: 'N',
  gradient: 'violet',
  schemaVersion: 1,
  createdAt: '2026-05-14T10:00:00.000Z',
  rootOrder: ['note-1', 'note-2'],
  tree: [],
  rootNotes: [
    {
      id: 'note-1',
      title: 'Note One',
      icon: '1',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    },
    {
      id: 'note-2',
      title: 'Note Two',
      icon: '2',
      folderId: null,
      updatedAt: '2026-05-14T10:05:00.000Z',
    },
  ],
}

function createSnapshotMeta(id: string, noteId: string): NoteSnapshotMeta {
  return {
    id,
    noteId,
    createdAt: `2026-05-14T10:0${id.endsWith('new') ? '6' : '1'}:00.000Z`,
    updatedAt: '2026-05-14T10:00:00.000Z',
  }
}

function createNote(id: string, title: string, text: string): NoteDocument {
  return {
    id,
    title,
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  }
}

async function flushHistoryModal() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function snapshotsForNote(noteId: string): NoteSnapshotMeta[] {
  if (noteId === 'note-1') return [createSnapshotMeta('snapshot-1-old', noteId)]
  if (noteId === 'note-2') {
    return [
      createSnapshotMeta('snapshot-2-new', noteId),
      createSnapshotMeta('snapshot-2-old', noteId),
    ]
  }
  return []
}

describe('WorkspaceHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(noteCommands.listNoteSnapshots).mockImplementation(async (_workspacePath, noteId) => snapshotsForNote(noteId))

    vi.mocked(noteCommands.listAllNoteSnapshots).mockImplementation(async () => {
      const entries: NoteSnapshotsEntry[] = []
      for (const noteId of ['note-1', 'note-2']) {
        const snapshots = snapshotsForNote(noteId)
        if (snapshots.length) entries.push({ noteId, snapshots })
      }
      return entries
    })

    vi.mocked(noteCommands.loadNoteSnapshot).mockImplementation(async (_workspacePath, noteId, snapshotId) => {
      if (noteId === 'note-1') return createNote(noteId, 'Snapshot One', snapshotId)
      return createNote(noteId, 'Snapshot Two', snapshotId)
    })

    vi.mocked(noteCommands.loadNote).mockImplementation(async (_workspacePath, noteId) => {
      return createNote(noteId, noteId === 'note-1' ? 'Current One' : 'Current Two', `current-${noteId}`)
    })

    vi.mocked(noteCommands.restoreNoteSnapshot).mockResolvedValue(
      createNote('note-2', 'Restored Two', 'restored-body'),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('prefers a preselected note, otherwise falls back to the active note, and filters files', async () => {
    const wrapper = mount(WorkspaceHistoryModal, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        workspacePath: '/workspace',
        manifest,
        activeNoteId: 'note-2',
        activeNote: createNote('note-2', 'Current Two', 'current-note-2'),
        preselectedNoteId: null,
      },
    })

    await flushHistoryModal()

    expect(document.body.textContent ?? '').toContain('Snapshot Two')
    expect(document.body.textContent ?? '').toContain('snapshot-2-new')

    const search = document.body.querySelector<HTMLInputElement>('input[type="search"]')
    expect(search).toBeTruthy()
    search!.value = 'one'
    search!.dispatchEvent(new Event('input'))
    await nextTick()

    expect(document.body.textContent ?? '').toContain('Note One')
    expect(document.body.textContent ?? '').not.toContain('Note Two')

    await wrapper.setProps({ preselectedNoteId: 'note-1' })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await flushHistoryModal()
    }

    expect(noteCommands.loadNoteSnapshot).toHaveBeenLastCalledWith('/workspace', 'note-1', 'snapshot-1-old')
    wrapper.unmount()
  })

  it('shows restore confirmation and cancel leaves state unchanged', async () => {
    const wrapper = mount(WorkspaceHistoryModal, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        workspacePath: '/workspace',
        manifest,
        activeNoteId: 'note-2',
        activeNote: createNote('note-2', 'Current Two', 'current-note-2'),
        preselectedNoteId: 'note-2',
      },
    })

    await flushHistoryModal()

    const restoreButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Restore snapshot'))
    expect(restoreButton).toBeTruthy()

    restoreButton!.click()
    await nextTick()
    expect(document.body.textContent ?? '').toContain('Restore this snapshot to the live note?')

    const cancelButton = document.body.querySelector<HTMLButtonElement>('.history-confirm .nv-btn')
    expect(cancelButton).toBeTruthy()
    cancelButton!.click()
    await nextTick()

    expect(document.body.textContent ?? '').not.toContain('Restore this snapshot to the live note?')
    expect(noteCommands.restoreNoteSnapshot).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('emits close event when Escape key is pressed', async () => {
    const wrapper = mount(WorkspaceHistoryModal, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: false,
        workspacePath: '/workspace',
        manifest,
        activeNoteId: 'note-2',
        activeNote: createNote('note-2', 'Current Two', 'current-note-2'),
        preselectedNoteId: 'note-2',
      },
    })

    await wrapper.setProps({ open: true })
    await flushHistoryModal()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    window.dispatchEvent(event)
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
