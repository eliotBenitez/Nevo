import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HistoryNotePicker from './HistoryNotePicker.vue'
import en from '../../locales/en.json'

const backend = {
  listAllNoteSnapshots: vi.fn(),
}

const noteById = new Map<string, { id: string; title: string; icon: string }>()

vi.mock('../../stores/workspace', () => ({
  useWorkspaceStore: () => ({ backend }),
}))

vi.mock('../../stores/tree', () => ({
  useTreeStore: () => ({ noteById }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function mountPicker() {
  return mount(HistoryNotePicker, { global: { plugins: [i18n] } })
}

describe('HistoryNotePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    noteById.clear()
    backend.listAllNoteSnapshots.mockResolvedValue([])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists only existing notes with snapshots, newest first, and emits the selected note id', async () => {
    noteById.set('note-old', { id: 'note-old', title: 'Older note', icon: '🗒️' })
    noteById.set('note-new', { id: 'note-new', title: 'Newer note', icon: '📘' })
    noteById.set('note-empty', { id: 'note-empty', title: 'No versions', icon: '📄' })
    backend.listAllNoteSnapshots.mockResolvedValue([
      { noteId: 'note-old', snapshots: [{ id: 'old-version', createdAt: '2026-05-01T10:00:00.000Z' }] },
      { noteId: 'note-empty', snapshots: [] },
      { noteId: 'note-new', snapshots: [{ id: 'new-version-old', createdAt: '2026-05-02T10:00:00.000Z' }, { id: 'new-version', createdAt: '2026-05-03T10:00:00.000Z' }] },
      { noteId: 'deleted-note', snapshots: [{ id: 'orphan-version', createdAt: '2026-05-04T10:00:00.000Z' }] },
    ])
    const wrapper = mountPicker()
    await flush()

    const noteButtons = wrapper.findAll('li button')
    expect(noteButtons.map(button => button.text())).toHaveLength(2)
    expect(noteButtons[0]?.text()).toContain('Newer note')
    expect(noteButtons[1]?.text()).toContain('Older note')
    expect(wrapper.text()).not.toContain('No versions')
    expect(wrapper.text()).not.toContain('deleted-note')

    await noteButtons[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['note-new']])
    wrapper.unmount()
  })

  it('shows a retry action after a backend error and loads notes on retry', async () => {
    noteById.set('note-recovered', { id: 'note-recovered', title: 'Recovered note', icon: '📄' })
    backend.listAllNoteSnapshots
      .mockRejectedValueOnce(new Error('workspace unavailable'))
      .mockResolvedValueOnce([
        { noteId: 'note-recovered', snapshots: [{ id: 'version-1', createdAt: '2026-05-03T10:00:00.000Z' }] },
      ])
    const wrapper = mountPicker()
    await flush()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load notes with saved versions.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flush()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Recovered note')
    expect(backend.listAllNoteSnapshots).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('filters note titles case-insensitively and clears the search', async () => {
    noteById.set('note-one', { id: 'note-one', title: 'Project Atlas', icon: 'FileText' })
    noteById.set('note-two', { id: 'note-two', title: 'Meeting notes', icon: 'NotebookPen' })
    backend.listAllNoteSnapshots.mockResolvedValue([
      { noteId: 'note-one', snapshots: [{ id: 'v1', createdAt: '2026-05-03T10:00:00.000Z' }] },
      { noteId: 'note-two', snapshots: [{ id: 'v2', createdAt: '2026-05-02T10:00:00.000Z' }] },
    ])
    const wrapper = mountPicker()
    await flush()

    const search = wrapper.get('input[type="search"]')
    await search.setValue('ATLAS')
    expect(wrapper.findAll('li button')).toHaveLength(1)
    expect(wrapper.text()).toContain('Project Atlas')
    expect(wrapper.text()).not.toContain('Meeting notes')
    expect(wrapper.text()).toContain('1')

    await wrapper.get('button[aria-label="Clear search"]').trigger('click')
    expect((search.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('li button')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows a list-shaped loading state and a distinct no-results state', async () => {
    let resolveSnapshots!: (value: unknown[]) => void
    backend.listAllNoteSnapshots.mockReturnValue(new Promise(resolve => { resolveSnapshots = resolve }))
    const wrapper = mountPicker()
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toContain('Loading notes')
    expect(wrapper.findAll('[data-testid="history-note-skeleton"]')).toHaveLength(3)

    resolveSnapshots([{ noteId: 'missing', snapshots: [{ id: 'v1', createdAt: '2026-05-03T10:00:00.000Z' }] }])
    await flush()
    expect(wrapper.text()).toContain('No notes have saved versions yet.')
    wrapper.unmount()
  })

  it('shows a distinct empty-search message when no title matches', async () => {
    noteById.set('note-one', { id: 'note-one', title: 'Project Atlas', icon: 'FileText' })
    backend.listAllNoteSnapshots.mockResolvedValue([
      { noteId: 'note-one', snapshots: [{ id: 'v1', createdAt: '2026-05-03T10:00:00.000Z' }] },
    ])
    const wrapper = mountPicker()
    await flush()
    await wrapper.get('input[type="search"]').setValue('missing')

    expect(wrapper.text()).toContain('No notes match your search.')
    expect(wrapper.findAll('li button')).toHaveLength(0)
    wrapper.unmount()
  })
})
