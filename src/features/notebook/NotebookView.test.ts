import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../locales/en.json'
import { createNotebook } from '../../core/notebook/codec'
import type { NoteDocument } from '../../types/note'
import NotebookView from './NotebookView.vue'
import { confirm } from '../../ui/composables/useConfirmDialog'

vi.mock('../../ui/composables/useConfirmDialog', () => ({ confirm: vi.fn().mockResolvedValue(false) }))

const mocked = vi.hoisted(() => ({ note: null as any, workspace: null as any }))
vi.mock('../../stores/note', () => ({ useNoteStore: () => mocked.note }))
vi.mock('../../stores/workspace', () => ({ useWorkspaceStore: () => mocked.workspace }))

const toolbarStub = defineComponent({
  props: { canUndo: Boolean, canRedo: Boolean },
  emits: ['undo', 'redo'],
  setup(_, { emit }) {
    return () => h('div', [
      h('button', { 'data-test': 'undo', onClick: () => emit('undo') }),
      h('button', { 'data-test': 'redo', onClick: () => emit('redo') }),
    ])
  },
})

const pagesStub = defineComponent({
  props: { pages: { type: Array, default: () => [] } },
  emits: ['add', 'remove'],
  setup(props, { emit }) { return () => h('div', [
    h('button', { 'data-test': 'add-page', onClick: () => emit('add') }),
    h('button', { 'data-test': 'remove-page', onClick: () => emit('remove', (props.pages.at(-1) as { id: string }).id) }),
  ]) },
})

const pageStub = defineComponent({
  props: { page: { type: Object, default: () => ({}) }, pageNumber: { type: Number, default: 0 } },
  setup(props) { return () => h('section', { 'data-test': `page-${props.pageNumber}` }) },
})

function fixture(): NoteDocument {
  return {
    id: 'notebook-1', title: 'Notes', icon: 'book', folderId: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    documentKind: 'notebook', notebook: createNotebook(), content: { type: 'doc', content: [] },
  }
}

async function mountNotebook(note = fixture()) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  mocked.note = {
    activeNote: note,
    setNotebookFromSession: vi.fn((snapshot, noteId) => {
      if (mocked.note.activeNote.id !== noteId) return false
      mocked.note.activeNote.notebook = snapshot
      return true
    }),
    flushDurably: vi.fn().mockResolvedValue({ ok: true }),
  }
  mocked.workspace = { activePath: '/workspace', appMetadata: null, appConfig: {}, saveAppConfig: vi.fn() }
  return mount(NotebookView, {
    props: { note, workspacePath: '/workspace', saveStatus: 'saved' },
    global: { plugins: [i18n], stubs: { NotebookToolbar: toolbarStub, NotebookPagesPanel: pagesStub, NotebookPage: pageStub } },
  })
}

describe('NotebookView persistence integration', () => {
  it('removes an empty page directly and keeps the remaining page undoable', async () => {
    const wrapper = await mountNotebook()
    await wrapper.get('[data-test="add-page"]').trigger('click')
    // The session-only ghost page renders after the real pages, so counts include it.
    await wrapper.get('[data-test="remove-page"]').trigger('click')
    expect(wrapper.findAll('[data-test^="page-"]')).toHaveLength(2)
    expect(confirm).not.toHaveBeenCalled()
    await wrapper.get('[data-test="undo"]').trigger('click')
    expect(wrapper.findAll('[data-test^="page-"]')).toHaveLength(2)
    wrapper.unmount()
  })

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('does not save on mount, autosaves real edits, and keeps undo across a store echo', async () => {
    vi.useFakeTimers()
    const wrapper = await mountNotebook()
    expect(mocked.note.setNotebookFromSession).not.toHaveBeenCalled()
    expect(mocked.note.flushDurably).not.toHaveBeenCalled()

    await wrapper.get('[data-test="add-page"]').trigger('click')
    await nextTick()
    expect(mocked.note.setNotebookFromSession).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(301)
    expect(mocked.note.flushDurably).toHaveBeenCalledOnce()

    const echoed = mocked.note.activeNote.notebook
    await wrapper.setProps({ note: { ...fixture(), notebook: echoed } })
    await wrapper.get('[data-test="undo"]').trigger('click')
    expect(wrapper.findAll('[data-test^="page-"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('clears undo history when a genuinely different snapshot is restored', async () => {
    const wrapper = await mountNotebook()
    await wrapper.get('[data-test="add-page"]').trigger('click')
    await nextTick()
    expect((wrapper.getComponent(toolbarStub).props('canUndo'))).toBe(true)
    const restored = fixture()
    restored.notebook = createNotebook('plain')
    await wrapper.setProps({ note: restored })
    expect(wrapper.getComponent(toolbarStub).props('canUndo')).toBe(false)
    wrapper.unmount()
  })
})
