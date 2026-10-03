import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../core/notebook'
import { LocalBackend } from '../../core/workspace-backend/localBackend'
import { useNoteStore } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import en from '../../locales/en.json'
import NotebookView from './NotebookView.vue'

describe('NotebookView live interaction', () => {
  let view: ReturnType<typeof mount> | null = null
  let frames: FrameRequestCallback[]
  let narrow = false

  beforeEach(() => {
    frames = []
    narrow = false
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: narrow })))
    vi.spyOn(LocalBackend.prototype, 'saveNote').mockResolvedValue(undefined)
    const pinia = createPinia()
    setActivePinia(pinia)
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/notebook-interaction' }
    useNoteStore().activeNote = {
      id: 'live-notebook', title: 'Notebook', icon: '📓', folderId: null,
      createdAt: '', updatedAt: '', content: { type: 'doc' },
      documentKind: 'notebook', notebook: createNotebook(),
    }
  })

  afterEach(() => {
    view?.unmount()
    view = null
    useNoteStore().clearNote()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function openNotebook() {
    view = mount(NotebookView, {
      attachTo: document.body,
      props: {
        note: useNoteStore().activeNote!, workspacePath: '/notebook-interaction', saveStatus: 'saved',
      },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    await flushPromises()
    return view
  }

  it('opens with remembered pen and marker colors and widths and remembers new choices', async () => {
    const workspace = useWorkspaceStore()
    workspace.appConfig.notebookTools = { penColor: '#dc2626', markerColor: '#0ea5e9', strokeWidth: 3, markerWidth: 18 }
    const save = vi.spyOn(workspace, 'saveAppConfig').mockResolvedValue(undefined)
    const wrapper = await openNotebook()
    const trigger = () => wrapper.get('.notebook-toolbar .nv-color-picker__trigger--swatch')
    const size = () => (wrapper.get('input[aria-label="Tool size"]').element as HTMLInputElement).value
    expect(trigger().html()).toContain('rgb(220, 38, 38)')
    expect(size()).toBe('3')

    await wrapper.get('button[aria-label="Highlighter"]').trigger('click')
    expect(trigger().html()).toContain('rgb(14, 165, 233)')
    expect(size()).toBe('18')

    await wrapper.get('button[aria-label="Pen"]').trigger('click')
    vi.useFakeTimers()
    await trigger().trigger('click')
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('.nv-color-picker__swatch[aria-label="Blue"]')!.click()
    await nextTick()
    expect(trigger().html()).toContain('rgb(29, 78, 216)')
    vi.advanceTimersByTime(800)
    expect(save).toHaveBeenCalledWith({ notebookTools: {
      penColor: '#1d4ed8', markerColor: '#0ea5e9', strokeWidth: 3, markerWidth: 18,
    } })
  })

  it('aligns a lasso selection through the toolbar menu as one undo step', async () => {
    const store = useNoteStore()
    store.activeNote!.notebook!.pages[0].objects = [
      { id: 'a', actionId: 'a', kind: 'stroke', color: '#123456', width: 2, opacity: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 150 }] },
      { id: 'b', actionId: 'b', kind: 'stroke', color: '#123456', width: 2, opacity: 1, points: [{ x: 150, y: 120 }, { x: 180, y: 160 }] },
    ]
    const wrapper = await openNotebook()
    await wrapper.get('button[aria-label="Lasso select"]').trigger('click')
    const page = wrapper.get('.notebook-page').element
    function pointer(type: string, x: number, y: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 }, pointerType: { value: 'mouse' }, button: { value: 0 },
        pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y },
      })
      page.dispatchEvent(event)
    }
    pointer('pointerdown', 80, 80)
    for (const [x, y] of [[220, 80], [220, 180], [80, 180]]) pointer('pointermove', x, y)
    pointer('pointerup', 80, 80)
    await nextTick()
    const before = store.activeNote!.notebook!
    await wrapper.get('.notebook-selection-toolbar button[aria-label="Align"]').trigger('click')
    const item = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.getAttribute('aria-label') === 'Align left')!
    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).slice(-2).every(button => button.disabled)).toBe(true)
    item.click()
    await nextTick()
    const aligned = store.activeNote!.notebook!
    expect(aligned).not.toBe(before)
    expect(aligned.pages[0].objects.map(object => object.points[0].x)).toEqual([100, 100])
    await wrapper.get('button[aria-label="Undo"]').trigger('click')
    expect(store.activeNote!.notebook).toEqual(before)
  })

  it('transforms a lasso selection with live preview, cancellation and one-step history', async () => {
    const store = useNoteStore()
    store.activeNote!.notebook!.pages[0].objects = [{
      id: 'selected', actionId: 'ink', kind: 'stroke', color: '#123456', width: 2, opacity: 1,
      points: [{ x: 100, y: 100 }, { x: 200, y: 150 }],
    }]
    const wrapper = await openNotebook()
    await wrapper.get('button[aria-label="Lasso select"]').trigger('click')
    const page = wrapper.get('.notebook-page').element
    function pointer(target: Element, type: string, x: number, y: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 }, pointerType: { value: 'mouse' }, button: { value: 0 },
        pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y },
      })
      target.dispatchEvent(event)
    }
    pointer(page, 'pointerdown', 80, 80)
    for (const [x, y] of [[220, 80], [220, 170], [80, 170]]) pointer(page, 'pointermove', x, y)
    pointer(page, 'pointerup', 80, 80)
    await nextTick()
    expect(wrapper.find('.notebook-selection-toolbar').exists()).toBe(true)
    const before = store.activeNote!.notebook!
    const path = wrapper.get('.notebook-ink > path').attributes('d')
    let handle = wrapper.get('.notebook-selection__scale-se').element
    pointer(handle, 'pointerdown', 201, 151)
    pointer(handle, 'pointermove', 251, 176)
    await nextTick()
    expect(store.activeNote!.notebook).toBe(before)
    expect(wrapper.get('.notebook-ink > path').attributes('d')).not.toBe(path)
    pointer(handle, 'pointercancel', 251, 176)
    await nextTick()
    expect(wrapper.get('.notebook-ink > path').attributes('d')).toBe(path)
    handle = wrapper.get('.notebook-selection__scale-se').element
    pointer(handle, 'pointerdown', 201, 151)
    pointer(handle, 'pointermove', 251, 176)
    pointer(handle, 'pointerup', 251, 176)
    await nextTick()
    const scaled = store.activeNote!.notebook!
    expect(scaled).not.toBe(before)
    expect(scaled.pages[0].objects).toHaveLength(1)
    await wrapper.get('button[aria-label="Undo"]').trigger('click')
    expect(store.activeNote!.notebook).toEqual(before)
    await wrapper.get('button[aria-label="Redo"]').trigger('click')
    expect(store.activeNote!.notebook).toBe(scaled)
    await wrapper.get('.notebook-selection__rotate').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(store.activeNote!.notebook).not.toBe(scaled)
    await wrapper.get('.notebook-selection__rotate').trigger('keydown', { key: 'z', ctrlKey: true })
    expect(store.activeNote!.notebook).toBe(scaled)
    await wrapper.get('.notebook-selection__rotate').trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    expect(store.activeNote!.notebook).not.toBe(scaled)
    await wrapper.get('.notebook-selection-toolbar .nv-color-picker__trigger--swatch').trigger('click')
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('.nv-color-picker__swatch[aria-label="Red"]')!.click()
    await nextTick()
    expect(store.activeNote!.notebook!.pages[0].objects[0].color).toBe('#dc2626')
    expect(wrapper.get('.notebook-color-control__quick-swatch').attributes('aria-label')).toBe('Red')
    await wrapper.get('button[aria-label="Copy selection"]').trigger('click')
    expect(store.activeNote!.notebook!.pages[0].objects).toHaveLength(2)
    await wrapper.get('button[aria-label="Hand tool"]').trigger('click')
    expect(wrapper.find('.notebook-selection-toolbar').exists()).toBe(false)
    expect(wrapper.find('.notebook-selection').exists()).toBe(false)
    await wrapper.get('button[aria-label="Lasso select"]').trigger('click')
    expect(wrapper.find('.notebook-selection-toolbar').exists()).toBe(true)
    expect(wrapper.find('.notebook-selection').exists()).toBe(true)
    await wrapper.get('button[aria-label="Clear selection"]').trigger('click')
    expect(wrapper.find('.notebook-selection-toolbar').exists()).toBe(false)
    expect(wrapper.find('.notebook-selection').exists()).toBe(false)
  })

  it.each(['pen', 'mouse'])('shows and expires laser trails with %s without editing the notebook', async pointerType => {
    const wrapper = await openNotebook()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const store = useNoteStore()
    const before = JSON.stringify(store.activeNote!.notebook)
    await wrapper.get('button[aria-label="Laser pointer"]').trigger('click')
    expect((wrapper.get('.notebook-toolbar .nv-color-picker__trigger--swatch').element as HTMLElement).style.background).toBe('rgb(239, 68, 68)')
    const page = wrapper.get('.notebook-page').element
    function dispatch(type: string, x: number, y: number, time: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 3 }, pointerType: { value: pointerType }, button: { value: 0 },
        pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: time },
      })
      page.dispatchEvent(event)
    }
    dispatch('pointerdown', 30, 30, 10)
    await nextTick()
    expect(wrapper.findComponent({ name: 'NotebookPage' }).props('activePoints')).toHaveLength(1)
    dispatch('pointermove', 100, 70, 20)
    frames.splice(0).forEach(callback => callback(20))
    await nextTick()
    expect(wrapper.findComponent({ name: 'NotebookPage' }).props('activePoints')).toHaveLength(2)
    expect(wrapper.findComponent({ name: 'NotebookPage' }).props('tool')).toBe('laser')
    const preview = wrapper.get('.notebook-laser__active path').attributes('d')
    expect(preview).toBeTruthy()
    vi.advanceTimersByTime(2500)
    expect(JSON.stringify(store.activeNote!.notebook)).toBe(before)
    dispatch('pointerup', 100, 70, 30)
    await nextTick()
    expect(wrapper.find('.notebook-laser__active').exists()).toBe(false)
    expect(wrapper.get('.notebook-laser__trace path').attributes('d')).toBeTruthy()
    expect(wrapper.emitted('update:notebook')).toBeUndefined()
    expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(1600)
    await nextTick()
    expect(wrapper.find('.notebook-laser__trace').exists()).toBe(false)
    expect(JSON.stringify(store.activeNote!.notebook)).toBe(before)
    await wrapper.get('button[aria-label="Pen"]').trigger('click')
    expect((wrapper.get('.notebook-toolbar .nv-color-picker__trigger--swatch').element as HTMLElement).style.background).toBe('rgb(0, 0, 0)')
    expect(wrapper.find('.notebook-color-control__quick-swatch').exists()).toBe(false)
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe('1.5')
    dispatch('pointerdown', 30, 40, 50)
    dispatch('pointerup', 100, 70, 60)
    await nextTick()
    expect(store.activeNote!.notebook!.pages[0].objects).toHaveLength(1)
    expect(wrapper.get('.notebook-color-control__quick-swatch').attributes('aria-label')).toBe('Black')
  })

  it('records recent colors only for committed ink, not eraser or lasso gestures', async () => {
    const wrapper = await openNotebook()
    const page = wrapper.get('.notebook-page').element
    let time = 10
    function stroke(pointerId: number) {
      for (const [type, x, y] of [['pointerdown', 30, 40], ['pointermove', 70, 60], ['pointerup', 100, 70]] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperties(event, {
          pointerId: { value: pointerId }, pointerType: { value: 'mouse' }, button: { value: 0 },
          pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: time += 10 },
        })
        page.dispatchEvent(event)
      }
    }
    await wrapper.get('button[aria-label="Eraser"]').trigger('click')
    stroke(4)
    await nextTick()
    await wrapper.get('button[aria-label="Lasso select"]').trigger('click')
    stroke(5)
    await nextTick()
    expect(wrapper.find('.notebook-color-control__quick-swatch').exists()).toBe(false)
    await wrapper.get('button[aria-label="Pen"]').trigger('click')
    stroke(6)
    await nextTick()
    expect(wrapper.findAll('.notebook-color-control__quick-swatch').map(node => node.attributes('aria-label'))).toEqual(['Black'])
  })

  it('adds a page when a stroke lands on the ghost page and removes it with one Ctrl+Z', async () => {
    const wrapper = await openNotebook()
    const store = useNoteStore()
    const pages = wrapper.findAll('[data-page-id]')
    expect(pages).toHaveLength(2)
    expect(pages[1].get('.notebook-page').attributes('aria-label')).toBe(en.notebook.pages.ghost)
    expect(store.activeNote!.notebook!.pages).toHaveLength(1)
    const ghostId = pages[1].attributes('data-page-id')!
    const target = pages[1].get('.notebook-page').element
    let time = 10
    for (const [type, x, y] of [['pointerdown', 30, 40], ['pointermove', 70, 60], ['pointerup', 100, 70]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 }, pointerType: { value: 'mouse' }, button: { value: 0 },
        pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: time += 10 },
      })
      target.dispatchEvent(event)
    }
    await nextTick()
    const notebook = store.activeNote!.notebook!
    expect(notebook.pages).toHaveLength(2)
    expect(notebook.pages[1].id).toBe(ghostId)
    expect(notebook.pages[1].objects).toHaveLength(1)
    expect(wrapper.findAll('[data-page-id]')[1].attributes('data-page-id')).toBe(ghostId)
    expect(wrapper.findAll('[data-page-id]')[1].get('.notebook-page').attributes('aria-label')).not.toBe(en.notebook.pages.ghost)
    await wrapper.get('.notebook-view').trigger('keydown', { key: 'z', ctrlKey: true })
    await nextTick()
    expect(store.activeNote!.notebook!.pages).toHaveLength(1)
    expect(wrapper.findAll('[data-page-id]')).toHaveLength(2)
  })

  it('does not add a page or a history entry for an eraser tap on the ghost page', async () => {
    const wrapper = await openNotebook()
    const store = useNoteStore()
    const before = store.activeNote!.notebook
    await wrapper.get('button[aria-label="Eraser"]').trigger('click')
    const target = wrapper.findAll('[data-page-id]')[1].get('.notebook-page').element
    let time = 10
    for (const [type, x, y] of [['pointerdown', 30, 40], ['pointerup', 30, 40]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 8 }, pointerType: { value: 'mouse' }, button: { value: 0 },
        pressure: { value: .5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: time += 10 },
      })
      target.dispatchEvent(event)
    }
    await nextTick()
    expect(store.activeNote!.notebook).toBe(before)
    expect(wrapper.findAll('[data-page-id]')).toHaveLength(2)
    expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the ruler session-local and commits guided ink with one-step Undo/Redo', async () => {
    const wrapper = await openNotebook()
    const store = useNoteStore()
    const before = JSON.stringify(store.activeNote!.notebook)
    expect(wrapper.find('.notebook-ruler').exists()).toBe(false)
    await wrapper.get('button[aria-label="Ruler"]').trigger('click')
    await wrapper.get('.notebook-ruler__move').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await wrapper.get('.notebook-ruler__rotate').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await wrapper.get('.notebook-ruler__rotate').trigger('keydown', { key: 'Home' })
    expect(JSON.stringify(store.activeNote!.notebook)).toBe(before)
    expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeDefined()
    const pose = wrapper.get('.notebook-ruler').attributes('transform')!.match(/translate\(([^ ]+) ([^)]+)\)/)!
    const x = Number(pose[1]), edge = Number(pose[2]) - 26
    const page = wrapper.get('.notebook-page').element
    function dispatch(type: string, px: number, py: number, time: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 }, pointerType: { value: 'pen' }, button: { value: 0 },
        pressure: { value: .7 }, clientX: { value: px }, clientY: { value: py }, timeStamp: { value: time },
      })
      page.dispatchEvent(event)
    }
    dispatch('pointerdown', x - 100, edge - 3, 10)
    dispatch('pointermove', x + 80, edge + 20, 20)
    frames.splice(0).forEach(callback => callback(20))
    await nextTick()
    expect(wrapper.get('.notebook-ink > path').attributes('d')).toBeTruthy()
    expect(JSON.stringify(store.activeNote!.notebook)).toBe(before)
    dispatch('pointerup', x + 100, edge + 30, 30)
    await nextTick()
    const points = store.activeNote!.notebook!.pages[0].objects[0]!.points
    expect(points.map(point => point.y)).toEqual([edge, edge, edge])
    await wrapper.get('button[aria-label="Undo"]').trigger('click')
    expect(store.activeNote!.notebook!.pages[0].objects).toHaveLength(0)
    await wrapper.get('button[aria-label="Redo"]').trigger('click')
    expect(store.activeNote!.notebook!.pages[0].objects[0]!.points).toEqual(points)
    await wrapper.get('button[aria-label="Ruler"]').trigger('click')
    expect(wrapper.find('.notebook-ruler').exists()).toBe(false)
  })

  it.each([false, true])('starts closed and allows opening/closing pages with narrow=%s', async value => {
    narrow = value
    const wrapper = await openNotebook()
    expect(wrapper.get('.notebook-pages').isVisible()).toBe(false)
    expect(wrapper.get('button[aria-label="Open page list"]').attributes('aria-expanded')).toBe('false')

    await wrapper.get('button[aria-label="Open page list"]').trigger('click')
    expect(wrapper.get('button[aria-label="Close page list"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.notebook-pages').isVisible()).toBe(true)
    ;(wrapper.get('.notebook-pages button[aria-label="Close page list"]').element as HTMLButtonElement).focus()
    await wrapper.get('.notebook-pages button[aria-label="Close page list"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.notebook-pages').isVisible()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.notebook-toolbar__pages-toggle').element)
    await wrapper.get('button[aria-label="Open page list"]').trigger('click')
    await wrapper.get('.notebook-toolbar button[aria-label="Close page list"]').trigger('click')
    expect(wrapper.get('.notebook-pages').isVisible()).toBe(false)
  })

  it.each(['pen', 'mouse'])('previews and commits a drawn arrow with %s input', async pointerType => {
    const wrapper = await openNotebook()
    await wrapper.get('button[aria-label="Arrow"]').trigger('click')
    const page = wrapper.get('.notebook-page').element
    function dispatch(type: string, x: number, y: number, timeStamp: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 }, pointerType: { value: pointerType }, button: { value: 0 },
        pressure: { value: 0.5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: timeStamp },
      })
      page.dispatchEvent(event)
    }
    dispatch('pointerdown', 30, 30, 10)
    dispatch('pointermove', 100, 70, 20)
    frames.splice(0).forEach(callback => callback(20))
    await nextTick()
    expect(wrapper.findAll('.notebook-arrow-preview path')).toHaveLength(3)
    const first = wrapper.get('.notebook-arrow-preview path').attributes('d')
    dispatch('pointermove', 160, 110, 30)
    frames.splice(0).forEach(callback => callback(30))
    await nextTick()
    expect(wrapper.get('.notebook-arrow-preview path').attributes('d')).not.toBe(first)
    expect(useNoteStore().activeNote!.notebook!.pages[0].objects).toHaveLength(0)
    dispatch('pointerup', 160, 110, 40)
    await nextTick()
    expect(wrapper.find('.notebook-arrow-preview').exists()).toBe(false)
    expect(useNoteStore().activeNote!.notebook!.pages[0].objects).toHaveLength(3)
    await wrapper.get(`button[aria-label="${en.notebook.undo}"]`).trigger('click')
    expect(useNoteStore().activeNote!.notebook!.pages[0].objects).toHaveLength(0)
  })

  it.each(['pen', 'mouse'])('updates the %s contour on every frame before releasing the pointer', async pointerType => {
    const wrapper = await openNotebook()
    const page = wrapper.get('.notebook-page').element
    function dispatch(type: string, x: number, y: number, timeStamp: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 }, pointerType: { value: pointerType }, button: { value: 0 },
        pressure: { value: 0.5 }, clientX: { value: x }, clientY: { value: y }, timeStamp: { value: timeStamp },
      })
      page.dispatchEvent(event)
    }
    dispatch('pointerdown', 30, 30, 10)
    await nextTick()
    const dot = wrapper.get('.notebook-ink path').attributes('d')
    dispatch('pointermove', 100, 70, 20)
    frames.splice(0).forEach(callback => callback(20))
    await nextTick()
    const line = wrapper.get('.notebook-ink path').attributes('d')
    expect(line).not.toBe(dot)
    expect(useNoteStore().activeNote!.notebook!.pages[0].objects).toHaveLength(0)

    dispatch('pointermove', 160, 110, 30)
    frames.splice(0).forEach(callback => callback(30))
    await nextTick()
    expect(wrapper.get('.notebook-ink path').attributes('d')).not.toBe(line)
    dispatch('pointerup', 160, 110, 40)
    await nextTick()
    expect(useNoteStore().activeNote!.notebook!.pages[0].objects).toHaveLength(1)
  })
})
