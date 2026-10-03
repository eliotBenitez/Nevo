import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { router } from '../../router'
import { createNotebook } from '../../core/notebook'
import { getEditorSession } from '../../core/document-session/editorSessionRegistry'
import { LocalBackend } from '../../core/workspace-backend/localBackend'
import { useNoteStore } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import type { NoteDocument } from '../../types/note'
import en from '../../locales/en.json'
import NotebookView from '../../features/notebook/NotebookView.vue'
import { flushBeforeWorkspaceSwitch } from '../../stores/workspaceSwitchGuard'
import { useNotePersistence } from '../../composables/useNotePersistence'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function notebookNote(id: string): NoteDocument {
  return {
    id,
    title: `Notebook ${id}`,
    icon: '📓',
    folderId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    documentKind: 'notebook',
    notebook: createNotebook('plain'),
  }
}

function pointerEvent(type: string, values: { pointerId: number; clientX: number; clientY: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId },
    pointerType: { value: 'mouse' },
    pressure: { value: 0.5 },
    button: { value: 0 },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
  })
  return event
}

function drawPendingStroke(root: HTMLElement, pointerId = 1): SVGSVGElement {
  const page = root.querySelector<SVGSVGElement>('.notebook-page')
  if (!page) throw new Error('Notebook page did not mount')
  const down = pointerEvent('pointerdown', { pointerId, clientX: 30, clientY: 30 })
  page.dispatchEvent(down)
  if (!down.defaultPrevented) throw new Error('Notebook did not accept the pen pointer')
  page.dispatchEvent(pointerEvent('pointermove', { pointerId, clientX: 80, clientY: 60 }))
  return page
}

describe('mounted notebook durability boundaries', () => {
  let pinia: ReturnType<typeof createPinia>
  let mounted: ReturnType<typeof mount> | null = null
  let shellPersistence: ReturnType<typeof mount> | null = null
  let noteId = ''
  let savedNotes: NoteDocument[] = []
  let failNextSave = false

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    savedNotes = []
    failNextSave = false
    noteId = `notebook-${crypto.randomUUID()}`
    await router.replace('/workspace')
    useWorkspaceStore().activeHandle = { kind: 'local', path: `/workspace-${noteId}` }
    const workspaceStore = useWorkspaceStore()
    vi.spyOn(workspaceStore, 'refreshSidebarNotePreviews').mockResolvedValue(undefined)
    const fixture = notebookNote(noteId)
    vi.spyOn(LocalBackend.prototype, 'loadNote').mockResolvedValue(fixture)
    vi.spyOn(LocalBackend.prototype, 'saveNote').mockImplementation(async (savedNote) => {
      if (failNextSave) {
        failNextSave = false
        throw new Error('disk full')
      }
      savedNotes.push(savedNote)
    })
    await useNoteStore().loadNote(noteId)
    await router.push(`/workspace/note/${noteId}`)
  })

  afterEach(async () => {
    shellPersistence?.unmount()
    shellPersistence = null
    mounted?.unmount()
    mounted = null
    vi.useRealTimers()
    vi.restoreAllMocks()
    useNoteStore().clearNote()
    await router.replace('/workspace')
  })

  function mountNotebook() {
    mounted = mount(NotebookView, {
      props: {
        note: useNoteStore().activeNote!,
        workspacePath: useWorkspaceStore().activePath!,
        saveStatus: useNoteStore().saveStatus,
      },
      global: { plugins: [pinia, i18n] },
    })
    return mounted
  }

  it('keeps a long contact active across the shell background-save timers', async () => {
    vi.useFakeTimers()
    const view = mountNotebook()
    shellPersistence = mount(defineComponent({ setup() {
      useNotePersistence()
      return () => null
    } }), { global: { plugins: [pinia] } })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1)
    const page = drawPendingStroke(view.element as HTMLElement)
    await vi.advanceTimersByTimeAsync(14_899)
    useNoteStore().setTitle('Metadata changed while writing')
    await vi.advanceTimersByTimeAsync(100)
    page.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 110, clientY: 75 }))
    page.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 120, clientY: 80 }))
    await useNoteStore().flushDurably()
    // Pen input is stored as the stroke-modeler trajectory, so assert that the late
    // samples were persisted (the path passes them) rather than their exact raw values.
    const stored = savedNotes.at(-1)?.notebook?.pages[0]?.objects.flatMap(object => object.points) ?? []
    const nearest = (x: number, y: number) => Math.min(...stored.map(point => Math.hypot(point.x - x, point.y - y)))
    expect(nearest(110, 75)).toBeLessThan(2)
    expect(nearest(120, 80)).toBeLessThan(0.5)
  })

  it('finishes pending pointer input in the production router guard and persists before leaving', async () => {
    const view = mountNotebook()
    await flushPromises()
    expect(useWorkspaceStore().activePath).toBe(`/workspace-${noteId}`)
    expect(useNoteStore().activeNote?.id).toBe(noteId)
    drawPendingStroke(view.element as HTMLElement)
    expect(useNoteStore().isDirty).toBe(false)

    await router.push('/workspace/settings')

    expect(router.currentRoute.value.path).toBe('/workspace/settings')
    expect(savedNotes).toHaveLength(1)
    expect(savedNotes[0]?.notebook?.pages[0]?.objects).toHaveLength(1)
    expect(useNoteStore().isDirty).toBe(false)
  })

  it('keeps the route and notebook draft when its production save fails', async () => {
    const view = mountNotebook()
    await flushPromises()
    drawPendingStroke(view.element as HTMLElement)
    failNextSave = true

    await router.push('/workspace/settings')

    expect(router.currentRoute.value.path).toBe(`/workspace/note/${noteId}`)
    expect(useNoteStore().activeNote?.notebook?.pages[0]?.objects).toHaveLength(1)
    expect(useNoteStore().isDirty).toBe(true)
    expect(view.find('.notebook-view').exists()).toBe(true)
  })

  it('does not write a clean note when reopened and then navigated away', async () => {
    mountNotebook()
    expect(savedNotes).toHaveLength(0)

    await router.push('/workspace/settings')

    expect(savedNotes).toHaveLength(0)
  })

  it('finishes input through the production workspace-switch guard', async () => {
    const view = mountNotebook()
    await flushPromises()
    drawPendingStroke(view.element as HTMLElement)

    await flushBeforeWorkspaceSwitch()

    expect(savedNotes).toHaveLength(1)
    expect(savedNotes[0]?.notebook?.pages[0]?.objects).toHaveLength(1)
    expect(useNoteStore().isDirty).toBe(false)
  })

  it('saves a live checkpoint after two seconds without ending the stroke, then groups the final points into one undo', async () => {
    vi.useRealTimers()
    const timeout = vi.spyOn(window, 'setTimeout')
    const view = mountNotebook()
    await flushPromises()
    const setNotebook = vi.spyOn(useNoteStore(), 'setNotebookFromSession')
    const flush = vi.spyOn(useNoteStore(), 'flushDurably')
    expect(useWorkspaceStore().activePath).toBe(`/workspace-${noteId}`)
    expect(useNoteStore().activeNote?.id).toBe(noteId)
    const page = drawPendingStroke(view.element as HTMLElement)
    await new Promise(resolve => setTimeout(resolve, 2_700))

    expect(setNotebook).toHaveBeenCalled()
    expect(timeout.mock.calls.map(([, delay]) => delay)).toContain(300)
    expect(useNoteStore().activeNote?.notebook?.pages[0]?.objects).toHaveLength(1)
    expect(flush).toHaveBeenCalled()
    expect(savedNotes).toHaveLength(1)
    expect(getEditorSession(noteId)).toBeDefined()
    page.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 90 }))
    page.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 100 }))
    await router.push('/workspace/settings')

    const finalSnapshot = savedNotes.at(-1)?.notebook
    expect(finalSnapshot?.pages[0]?.objects.length).toBeGreaterThan(1)
    expect(new Set(finalSnapshot?.pages[0]?.objects.map(object => object.actionId)).size).toBe(1)
    expect(finalSnapshot?.pages[0]?.objects.reduce((total, object) => total + object.points.length, 0)).toBeGreaterThan(2)
    await view.get('button[aria-label="Undo"]').trigger('click')
    expect(view.findAll('.notebook-ink path')).toHaveLength(0)
  })
})
