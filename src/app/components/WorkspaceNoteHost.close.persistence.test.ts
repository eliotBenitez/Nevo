import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalBackend } from '../../core/workspace-backend/localBackend'
import { createNotebook } from '../../core/notebook'
import { useNoteStore } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import type { NoteDocument } from '../../types/note'
import en from '../../locales/en.json'
import { useAppCloseGuard } from '../../composables/useAppCloseGuard'

const mocks = vi.hoisted(() => ({
  closeListener: null as (() => void) | null,
  invoke: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(false),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, handler: () => void) => {
    mocks.closeListener = handler
    return vi.fn()
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('../../ui/composables/useConfirmDialog', () => ({ confirm: mocks.confirm }))
vi.mock('../../utils/logger', () => ({ appLogger: { error: vi.fn().mockResolvedValue(undefined) } }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const GuardHarness = defineComponent({ setup() { useAppCloseGuard(); return () => h('div') } })

function note(id: string): NoteDocument {
  return {
    id,
    title: 'Close test',
    icon: '📓',
    folderId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    documentKind: 'notebook',
    notebook: createNotebook('plain'),
  }
}

describe('production app-close notebook barrier', () => {
  let wrapper: ReturnType<typeof mount> | null = null
  let noteId = ''

  beforeEach(async () => {
    setActivePinia(createPinia())
    mocks.closeListener = null
    mocks.invoke.mockClear()
    mocks.confirm.mockReset().mockResolvedValue(false)
    noteId = `close-notebook-${crypto.randomUUID()}`
    useWorkspaceStore().activeHandle = { kind: 'local', path: `/workspace-${noteId}` }
    vi.spyOn(LocalBackend.prototype, 'saveNote').mockResolvedValue(undefined)
    vi.spyOn(useWorkspaceStore(), 'refreshSidebarNotePreviews').mockResolvedValue(undefined)
    vi.spyOn(LocalBackend.prototype, 'loadNote').mockResolvedValue(note(noteId))
    await useNoteStore().loadNote(noteId)
    wrapper = mount(GuardHarness, { global: { plugins: [i18n] } })
    await flushPromises()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    useNoteStore().clearNote()
  })

  it('keeps the window open when an overlapping notebook revision survives the close flush', async () => {
    const noteStore = useNoteStore()
    const initial = noteStore.activeNote!.notebook!
    noteStore.setNotebook({ ...initial, vendorCheckpoint: 'before-close' }, noteId)
    vi.spyOn(LocalBackend.prototype, 'saveNote').mockImplementationOnce(async () => {
      noteStore.setNotebookFromSession({ ...noteStore.activeNote!.notebook!, vendorCheckpoint: 'late-input' }, noteId)
    })

    expect(mocks.closeListener).toBeTypeOf('function')
    mocks.closeListener?.()
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())

    expect(mocks.invoke).not.toHaveBeenCalledWith('allow_app_close')
    expect(noteStore.isDirty).toBe(true)
    expect(noteStore.activeNote?.notebook).toMatchObject({ vendorCheckpoint: 'late-input' })
  })
})
