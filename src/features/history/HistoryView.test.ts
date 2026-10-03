import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick, reactive } from 'vue'
import HistoryView from './HistoryView.vue'
import HistoryTopBar from './HistoryTopBar.vue'
import en from '../../locales/en.json'
import type { NoteDocument, NoteSnapshotMeta, RestoreNoteSnapshotResult } from '../../types/note'

// History reads the live note and snapshots directly from the workspace backend.
const backend = {
  listNoteSnapshots: vi.fn(),
  loadNote: vi.fn(),
  loadNoteSnapshot: vi.fn(),
  saveNote: vi.fn(),
}

const noteStoreMock = reactive<{ activeNote: NoteDocument | null }>({ activeNote: null })
const restoreSnapshot = vi.fn()
const invalidateNoteCache = vi.fn()
const createTreeNote = vi.fn()
const syncNoteMeta = vi.fn()
const refreshSidebarNotePreviews = vi.fn()

function restoreResult(overrides: Partial<RestoreNoteSnapshotResult> = {}): RestoreNoteSnapshotResult {
  return { note: createNote('note-1', 'Restored body'), recoverySnapshotId: 'snap-recovery', warnings: [], ...overrides }
}

vi.mock('../../stores/workspace', () => ({
  useWorkspaceStore: () => ({
    backend,
    settings: { files: { snapshotRetentionCount: 50 } },
    getRelativeTime: (value: string) => `relative:${value}`,
    refreshSidebarNotePreviews,
  }),
}))

vi.mock('../../stores/note', () => ({
  useNoteStore: () => ({
    get activeNote() { return noteStoreMock.activeNote },
    restoreSnapshot: (...args: [string, string]) => restoreSnapshot(...args),
    invalidateNoteCache,
  }),
}))

vi.mock('../../stores/tree', () => ({
  useTreeStore: () => ({
    noteById: new Map([
      ['note-1', { id: 'note-1', title: 'Note One', icon: '1', folderId: 'folder-1', updatedAt: '2026-05-14T10:00:00.000Z' }],
    ]),
    createNote: (...args: [string | null, string, string]) => createTreeNote(...args),
    syncNoteMeta: (...args: unknown[]) => syncNoteMeta(...args),
    // copySelectedSnapshot rolls back the created note if a later step
    // fails (see useNoteHistory.ts) — these must resolve for the existing
    // "copy fails" test to still surface the original error, not a rollback one.
    deleteNote: vi.fn().mockResolvedValue(undefined),
    permanentlyDeleteFromTrash: vi.fn().mockResolvedValue(undefined),
  }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function createNote(id: string, text: string, overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id,
    title: 'Note One',
    icon: '1',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    ...overrides,
  }
}

function createSnapshots(): NoteSnapshotMeta[] {
  return [
    { id: 'snap-new', noteId: 'note-1', createdAt: '2026-05-14T12:00:00.000Z', updatedAt: '2026-05-14T11:00:00.000Z' },
    { id: 'snap-old', noteId: 'note-1', createdAt: '2026-05-14T09:00:00.000Z', updatedAt: '2026-05-14T08:00:00.000Z' },
  ]
}

async function flush() {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve()
  await nextTick()
}

function mountView() {
  return mount(HistoryView, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { noteId: 'note-1' },
  })
}

describe('HistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    noteStoreMock.activeNote = createNote('note-1', 'Current body')
    backend.listNoteSnapshots.mockImplementation(async () => createSnapshots())
    backend.loadNote.mockImplementation(async () => noteStoreMock.activeNote ?? createNote('note-1', 'Current body'))
    backend.loadNoteSnapshot.mockImplementation(async (_noteId: string, snapshotId: string) =>
      createNote('note-1', snapshotId === 'snap-new' ? 'Newer snapshot body' : 'Older snapshot body'))
    backend.saveNote.mockResolvedValue(undefined)
    restoreSnapshot.mockResolvedValue(restoreResult())
    createTreeNote.mockResolvedValue(createNote('note-copy', ''))
    refreshSidebarNotePreviews.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads the timeline, selects the newest version, and renders the diff against the current note', async () => {
    const wrapper = mountView()
    await flush()

    expect(backend.listNoteSnapshots).toHaveBeenCalledWith('note-1')
    expect(backend.loadNoteSnapshot).toHaveBeenLastCalledWith('note-1', 'snap-new')
    // A "changed" row now merges both sides into one inline word diff (see
    // HistoryDiffRowChanged.vue) instead of two whole blocks, so only the
    // parts that actually differ ("Newer snapshot" / "Current") plus the
    // shared "body" survive as literal substrings.
    expect(document.body.textContent ?? '').toContain('Newer snapshot')
    expect(document.body.textContent ?? '').toContain('Current body')
    // A single non-zero stat kind gets the total block count for context
    // instead of reading as a lonely number.
    expect(document.body.querySelector('.history-diff-pane__stat--total')?.textContent).toContain('1 blocks total')
    // One merged block per changed row, not a whole "removed" block stacked
    // on a whole "added" block.
    expect(document.body.querySelectorAll('.history-diff-row-changed').length).toBe(1)
    expect(document.body.querySelectorAll('.history-diff-row').length).toBe(0)
    wrapper.unmount()
  })

  it('shows a retryable current-note error instead of claiming there are no differences', async () => {
    backend.loadNote.mockRejectedValueOnce(new Error('disk unavailable'))
    const wrapper = mountView()
    await flush()

    const error = document.body.querySelector('.history-diff-pane__state--error')
    expect(error?.textContent).toContain('Could not load the current note for comparison')
    expect(document.body.textContent).not.toContain('No differences between the current note and this version.')

    backend.loadNote.mockResolvedValueOnce(createNote('note-1', 'Current body'))
    await wrapper.get('.history-diff-pane__retry').trigger('click')
    await flush()
    expect(document.body.querySelector('.history-diff-pane__state--error')).toBeNull()
    expect(document.body.textContent).toContain('Newer snapshot')
    wrapper.unmount()
  })

  it('labels snapshots from the current calendar day as today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T18:00:00.000Z'))
    try {
      const wrapper = mountView()
      await flush()

      expect(document.body.querySelector('.history-timeline__timestamp')?.textContent).toContain('Today')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a metadata strip instead of "no differences" when only the title changed', async () => {
    noteStoreMock.activeNote = createNote('note-1', 'Same body', { title: 'Renamed Note' })
    backend.loadNoteSnapshot.mockImplementation(async () => createNote('note-1', 'Same body', { title: 'Note One' }))

    const wrapper = mountView()
    await flush()

    expect(document.body.textContent ?? '').not.toContain('No differences')
    expect(document.body.querySelector('.history-metadata-strip')).toBeTruthy()
    expect(document.body.textContent ?? '').toContain('Note One')
    expect(document.body.textContent ?? '').toContain('Renamed Note')
    wrapper.unmount()
  })

  it('shows "Formatting changed" for a block whose only difference is a mark', async () => {
    noteStoreMock.activeNote = createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same text', marks: [{ type: 'strong' }] }] }],
      },
    })
    backend.loadNoteSnapshot.mockResolvedValue(createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Same text' }] }],
      },
    }))

    const wrapper = mountView()
    await flush()

    expect(document.body.textContent ?? '').toContain('Formatting changed')
    wrapper.unmount()
  })

  it('shows the "No differences" message for a key-order-only difference', async () => {
    noteStoreMock.activeNote = createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [{ type: 'heading', attrs: { id: null, level: 2 }, content: [{ type: 'text', text: 'Same heading' }] }],
      },
    })
    backend.loadNoteSnapshot.mockResolvedValue(createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 2, id: null }, content: [{ type: 'text', text: 'Same heading' }] }],
      },
    }))

    const wrapper = mountView()
    await flush()

    expect(document.body.textContent ?? '').toContain('No differences')
    wrapper.unmount()
  })

  it('switches to "As note" mode and shows the raw snapshot content', async () => {
    const wrapper = mountView()
    await flush()

    const asNoteTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.history-diff-pane__tab'))
      .find(btn => btn.textContent?.includes('As note'))
    expect(asNoteTab).toBeTruthy()
    asNoteTab!.click()
    await nextTick()

    expect(document.body.querySelector('.history-diff-pane__blocks .history-preview-block')).toBeTruthy()
    expect(document.body.querySelector('.history-diff-pane__blocks .history-preview-block')?.textContent).toContain('Newer snapshot body')
    wrapper.unmount()
  })

  it('renders unchanged heading context with document hierarchy', async () => {
    noteStoreMock.activeNote = createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shared heading' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Current body' }] },
        ],
      },
    })
    backend.loadNoteSnapshot.mockResolvedValue(createNote('note-1', 'unused', {
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shared heading' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Snapshot body' }] },
        ],
      },
    }))

    const wrapper = mountView()
    await flush()

    expect(document.body.querySelector('h2.history-block-content--heading')?.textContent).toBe('Shared heading')
    wrapper.unmount()
  })

  it('shows restore confirmation and cancel leaves state unchanged', async () => {
    const wrapper = mountView()
    await flush()

    const restoreButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')
    expect(restoreButton).toBeTruthy()
    restoreButton!.click()
    await flush()

    expect(document.body.textContent ?? '').toContain('Restore the version from May 14 03:00 PM?')

    const cancelButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn:not(.nv-btn--primary)')
    expect(cancelButton).toBeTruthy()
    cancelButton!.click()
    await nextTick()

    expect(document.body.textContent ?? '').not.toContain('Restore the version from May 14 03:00 PM?')
    expect(restoreSnapshot).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('the back button has an accessible name', async () => {
    const wrapper = mountView()
    await flush()
    expect(document.body.querySelector('.history-top-bar__back')?.getAttribute('aria-label')).toBe('Back to history list')
    wrapper.unmount()
  })

  it('confirmation names the version time and closes when another version is selected', async () => {
    const wrapper = mountView()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    const group = document.body.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-labelledby')).toBe('history-restore-confirmation')
    expect(group.querySelectorAll('button')[0]?.textContent).toContain('Cancel')
    expect(group.querySelectorAll('button')[1]?.textContent).toContain('Confirm')
    expect(group.textContent).toContain('Restore the version from May 14 03:00 PM?')
    document.body.querySelectorAll<HTMLButtonElement>('.history-timeline__entry')[1]!.click()
    await flush()
    expect(document.body.querySelector('[role="group"]')).toBeNull()
    wrapper.unmount()
  })

  it('moves focus to Cancel and closes confirmation on Escape', async () => {
    const wrapper = mountView()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    const group = document.body.querySelector('[role="group"]')!
    const cancel = group.querySelector('button')
    expect(document.activeElement).toBe(cancel)
    cancel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(document.body.querySelector('[role="group"]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the confirmation open when Escape is pressed during a restore', async () => {
    let rejectRestore!: (error: Error) => void
    restoreSnapshot.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRestore = reject }))
    const wrapper = mountView()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    const group = document.body.querySelector('[role="group"]')!
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__confirm')!.click()
    await flush()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    group.dispatchEvent(escape)
    await flush()

    expect(escape.defaultPrevented).toBe(true)
    expect(document.body.querySelector('[role="group"]')).toBe(group)
    expect(group.querySelector('button')?.disabled).toBe(true)
    rejectRestore(new Error('disk full'))
    await flush()
    expect(document.body.querySelector('[role="group"]')).toBe(group)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('disk full')
    wrapper.unmount()
  })

  it('confirm is disabled while the selected version is loading', async () => {
    const wrapper = mount(HistoryTopBar, {
      global: { plugins: [i18n] },
      props: {
        noteTitle: 'Note One', noteIcon: '1',
        confirmation: { snapshotId: 'snap-new', createdAt: '2026-05-14T12:00:00.000Z' },
        confirmLabel: 'May 14 03:00 PM', canRestore: false, canCopy: false, restoring: false,
        restoreError: null, restoreWarning: null, restoreSucceeded: false, copying: false, copyError: null,
      },
    })
    expect(wrapper.find('.history-top-bar__confirm').element).toHaveProperty('disabled', true)
    wrapper.unmount()
  })

  it('tabs expose tab/tabpanel relationships and support arrow/Home/End keys', async () => {
    const wrapper = mountView()
    await flush()
    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const panel = document.body.querySelector('[role="tabpanel"]')
    expect(tabs[0]?.id).toBe('history-tab-inline')
    expect(tabs[0]?.getAttribute('aria-controls')).toBe('history-panel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id)
    tabs[0]!.focus()
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'End' })
    await nextTick()
    expect(document.activeElement).toBe(tabs[2])
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'Home' })
    await nextTick()
    expect(document.activeElement).toBe(tabs[0])
    wrapper.unmount()
  })

  it('a failed timeline load offers retry', async () => {
    backend.listNoteSnapshots.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountView()
    await flush()
    expect(document.body.querySelector('[role="alert"]')).toBeTruthy()
    document.body.querySelector<HTMLButtonElement>('.history-timeline__retry')!.click()
    await flush()
    expect(document.body.querySelectorAll('.history-timeline__entry')).toHaveLength(2)
    wrapper.unmount()
  })

  it('a failed snapshot load offers retry', async () => {
    backend.loadNoteSnapshot.mockRejectedValueOnce(new Error('corrupt'))
    const wrapper = mountView()
    await flush()
    expect(document.body.querySelector('.history-diff-pane__state[role="alert"]')).toBeTruthy()
    document.body.querySelector<HTMLButtonElement>('.history-diff-pane__retry')!.click()
    await flush()
    expect(backend.loadNoteSnapshot).toHaveBeenCalledTimes(2)
    expect(document.body.querySelector('.history-diff-pane__state--error')).toBeNull()
    wrapper.unmount()
  })

  it('after restore the recovery version is selected and badged', async () => {
    backend.listNoteSnapshots.mockImplementation(async () => [
      ...createSnapshots(),
      { id: 'snap-recovery', noteId: 'note-1', createdAt: '2026-05-14T13:00:00.000Z', updatedAt: '2026-05-14T13:00:00.000Z' },
    ])
    const wrapper = mountView()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    const recovery = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.history-timeline__entry'))
      .find(entry => entry.textContent?.includes('Before restore'))
    expect(recovery?.getAttribute('aria-pressed')).toBe('true')
    expect(recovery?.textContent).toContain('Before restore')
    wrapper.unmount()
  })

  it('announces restore success and maintenance warning together', async () => {
    restoreSnapshot.mockResolvedValueOnce(restoreResult({ warnings: ['pruneFailed'] }))
    const wrapper = mountView()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()
    document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')!.click()
    await flush()

    const status = document.body.querySelector('[role="status"][aria-live="polite"]')
    expect(status?.textContent).toContain('Version restored.')
    expect(status?.textContent).toContain('Some cleanup did not finish')
    expect(document.body.querySelector('.history-top-bar__warning')?.textContent).toContain('Some cleanup did not finish')
    wrapper.unmount()
  })

  it('shows an error message when restore fails and keeps the confirm step open', async () => {
    restoreSnapshot.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountView()
    await flush()

    const restoreButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')
    restoreButton!.click()
    await nextTick()
    const confirmButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__actions .nv-btn--primary')
    confirmButton!.click()
    await flush()

    expect(restoreSnapshot).toHaveBeenCalledWith('note-1', 'snap-new')
    expect(document.body.textContent ?? '').toContain('disk full')
    wrapper.unmount()
  })

  it('emits "back" when the top-bar back button is clicked', async () => {
    const wrapper = mountView()
    await flush()

    const backButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__back')
    expect(backButton).toBeTruthy()
    backButton!.click()

    expect(wrapper.emitted('back')).toBeTruthy()
    wrapper.unmount()
  })

  it('copies the selected snapshot into a new note and opens it after persistence succeeds', async () => {
    const selectedSnapshot = createNote('note-1', 'Snapshot body', {
      title: 'Historic title',
      icon: 'H',
      cover: '.nevo/assets/cover.png',
      folderId: 'folder-1',
      properties: { type: 'research', tags: ['history'], date: '2026-05-14', status: 'active' },
      canvas: { version: 1 } as NoteDocument['canvas'],
    }) as NoteDocument & { futureField: { preserved: boolean } }
    selectedSnapshot.futureField = { preserved: true }
    backend.loadNoteSnapshot.mockResolvedValue(selectedSnapshot)

    const wrapper = mountView()
    await flush()

    const copyButton = document.body.querySelector<HTMLButtonElement>('.history-top-bar__copy')
    expect(copyButton).toBeTruthy()
    copyButton!.click()
    await flush()

    expect(createTreeNote).toHaveBeenCalledWith('folder-1', 'Historic title — copy', 'H')
    expect(backend.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-copy',
      title: 'Historic title — copy',
      icon: 'H',
      folderId: 'folder-1',
      cover: '.nevo/assets/cover.png',
      content: selectedSnapshot.content,
      canvas: selectedSnapshot.canvas,
      properties: selectedSnapshot.properties,
      futureField: { preserved: true },
    }))
    expect(invalidateNoteCache).toHaveBeenCalledWith('note-copy')
    expect(wrapper.emitted('open-note')).toEqual([['note-copy']])
    wrapper.unmount()
  })

  it('stays in history and exposes an error when copying the selected snapshot fails', async () => {
    backend.saveNote.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountView()
    await flush()

    document.body.querySelector<HTMLButtonElement>('.history-top-bar__copy')!.click()
    await flush()

    expect(wrapper.emitted('open-note')).toBeUndefined()
    expect(document.body.querySelector('.history-top-bar__error')?.textContent).toContain('disk full')
    wrapper.unmount()
  })
})
