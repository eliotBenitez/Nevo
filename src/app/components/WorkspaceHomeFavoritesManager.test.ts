import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import WorkspaceHomeFavoritesManager from './WorkspaceHomeFavoritesManager.vue'
import type { WorkspaceHomeItem } from '../composables/useWorkspaceHome'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function note(id: string, title = id, available = true): WorkspaceHomeItem {
  return {
    key: `note:${id}`,
    favorite: { kind: 'note', id },
    kind: 'note',
    title,
    icon: '📄',
    route: available ? `/workspace/note/${id}` : null,
    updatedAt: null,
    available,
    loading: false,
  }
}

function folder(id: string, title = id): WorkspaceHomeItem {
  return {
    key: `folder:${id}`,
    favorite: { kind: 'folder', id },
    kind: 'folder',
    title,
    icon: '📁',
    route: `/workspace/folder/${id}`,
    updatedAt: null,
    available: true,
    loading: false,
  }
}

function mountManager(items: WorkspaceHomeItem[], candidates = items) {
  return mount(WorkspaceHomeFavoritesManager, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { Teleport: true },
    },
    props: { open: true, items, candidates },
  })
}

function mockElementFromPoint(element: Element) {
  const mock = vi.fn(() => element)
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: mock,
  })
  return mock
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementFromPoint')
  document.body.innerHTML = ''
})

describe('WorkspaceHomeFavoritesManager', () => {
  it('searches and filters the available library', async () => {
    const wrapper = mountManager([], [note('alpha', 'Alpha note'), folder('projects', 'Projects')])

    await wrapper.get('.home-manager__search input').setValue('projects')
    expect(document.body.textContent).toContain('Projects')
    expect(document.body.textContent).not.toContain('Alpha note')

    await wrapper.get('.home-manager__search input').setValue('')
    const folderFilter = wrapper.findAll('.home-manager__filters button')
      .find(button => button.text() === 'Folders')!
    await folderFilter.trigger('click')

    expect(document.body.textContent).toContain('Projects')
    expect(document.body.textContent).not.toContain('Alpha note')
    wrapper.unmount()
  })

  it('does not emit a ninth addition and explains the limit through aria-live', async () => {
    const items = Array.from({ length: 8 }, (_, index) => note(`note-${index}`))
    const graph: WorkspaceHomeItem = {
      key: 'graph',
      favorite: { kind: 'graph' },
      kind: 'graph',
      title: 'Graph',
      icon: 'lucide:network',
      route: '/workspace/graph',
      updatedAt: null,
      available: true,
      loading: false,
    }
    const wrapper = mountManager(items, [graph])

    await wrapper.get('.home-manager__candidate .nv-btn').trigger('click')

    expect(wrapper.emitted('add')).toBeUndefined()
    expect(document.body.textContent).toContain('Home is full')
    wrapper.unmount()
  })

  it('removes unavailable favorites and supports pointer and keyboard reorder', async () => {
    const unavailable = note('missing', 'Missing note', false)
    const wrapper = mountManager([unavailable, note('second', 'Second')])

    await wrapper.get('.home-manager__remove').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[unavailable]])

    const handles = wrapper.findAll('.home-manager__drag')
    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
    Object.defineProperties(pointerDown, {
      button: { value: 0 },
      clientX: { value: 10 },
      clientY: { value: 10 },
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
    })
    handles[0].element.dispatchEvent(pointerDown)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.home-manager__favorite')[0].classes())
      .not.toContain('home-manager__favorite--dragging')

    mockElementFromPoint(wrapper.findAll('.home-manager__favorite')[1].element)
    const pointerMove = new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 20,
      clientY: 60,
    })
    Object.defineProperty(pointerMove, 'pointerId', { value: 1 })
    window.dispatchEvent(pointerMove)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-favorite-index="0"]').classes())
      .toContain('home-manager__favorite--dragging')
    expect(wrapper.find('.home-manager__favorite--floating-ready').exists()).toBe(true)

    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperties(pointerUp, {
      clientX: { value: 20 },
      clientY: { value: 80 },
      pointerId: { value: 1 },
    })
    window.dispatchEvent(pointerUp)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('move')?.[0]).toEqual([0, 1])
    expect(wrapper.findAll('.home-manager__favorite')[0].classes())
      .not.toContain('home-manager__favorite--dragging')

    await wrapper.findAll('.home-manager__favorite')[1].trigger('keydown', {
      key: 'ArrowUp',
      altKey: true,
    })
    expect(wrapper.emitted('move')?.[1]).toEqual([1, 0])
    wrapper.unmount()
  })

  it('coalesces pointer movement into animation frames and moves the dragged layer directly', async () => {
    const wrapper = mountManager([note('first', 'First'), note('second', 'Second')])
    const favorites = wrapper.findAll('.home-manager__favorite')
    let frameCallback: FrameRequestCallback | null = null
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallback = callback
        return 41
      })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const elementFromPoint = mockElementFromPoint(favorites[1].element)
    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
    Object.defineProperties(pointerDown, {
      button: { value: 0 },
      clientX: { value: 20 },
      clientY: { value: 100 },
      pointerId: { value: 7 },
      pointerType: { value: 'mouse' },
    })
    wrapper.get('.home-manager__drag').element.dispatchEvent(pointerDown)
    await wrapper.vm.$nextTick()

    for (const clientY of [112, 128]) {
      const pointerMove = new Event('pointermove', { bubbles: true })
      Object.defineProperties(pointerMove, {
        clientX: { value: 24 },
        clientY: { value: clientY },
        pointerId: { value: 7 },
      })
      window.dispatchEvent(pointerMove)
    }

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(elementFromPoint).not.toHaveBeenCalled()
    expect(frameCallback).not.toBeNull()
    const runFrame = frameCallback as unknown as (time: number) => void
    runFrame(0)
    await wrapper.vm.$nextTick()

    expect(elementFromPoint).toHaveBeenCalledOnce()
    const floatingPreview = document.body.querySelector<HTMLElement>('.home-manager__favorite--floating')
    expect(floatingPreview?.style.transform).toContain('translate3d(3px, 23px, 0)')
    expect(wrapper.get('[data-favorite-index="0"]').classes())
      .toContain('home-manager__favorite--dragging')
    expect(wrapper.findAll('.home-manager__favorite')[1].classes())
      .toContain('home-manager__favorite--drop-after')
    wrapper.unmount()
  })

  it('does not create status text after moving a favorite', async () => {
    const wrapper = mountManager([note('first', 'First'), note('second', 'Second')])

    await wrapper.findAll('.home-manager__move-buttons button')[1].trigger('click')

    const announcement = wrapper.get('.home-manager__announcement')
    expect(announcement.attributes('aria-live')).toBe('polite')
    expect(announcement.text()).toBe('')
    wrapper.unmount()
  })
})
